import express from 'express';
import { processReportEmbeddings } from '../services/embeddingService.js';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { getTimelineReport } from '../../db/reports.js';
import { isDoctorLinkedToPatient } from '../../db/doctorPatients.js';
import { isPatientLinkedToFamilyMember } from '../../db/family.js';

const router = express.Router();

// This service does NOT own report storage — backend/ does that (see
// backend/routes/reports.js, backend/db/reports.js). These endpoints exist
// purely as the indexing trigger: the frontend calls backend/api/reports to
// save/delete a report as normal, and ALSO calls this endpoint with the
// same report so it becomes searchable. Nothing here touches the `reports`
// table itself.

/**
 * POST /api/reports/index
 * Body: the saved report as returned by backend POST /api/reports
 *   { id, title, doctor, hospital, category, reportDate, diagnosis,
 *     medicines, notes, fileUrl, ... }
 * Chunk + embed title/diagnosis/medicines/notes so it becomes searchable —
 * not just notes (see embeddingService.js: diagnosis/medicines used to be
 * silently dropped here, so "what medicines was this patient prescribed?"
 * would find the right report but the chunk had no drug names in it).
 * user_id comes from the JWT, not the body.
 */
router.post('/index', requireAuth, async (req, res) => {
  const callerId = req.user.userId;
  const { id } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'id (report id) is required' });
  }

  try {
    // The report's owner and content come from the `reports` row itself, never
    // from the request body: trusting the body let any logged-in user
    // overwrite or wipe another user's index chunks by guessing a (sequential)
    // report id, and plant text that later surfaced as "grounding" in someone
    // else's answers.
    const { data: row, error: lookupError } = await supabase
      .from('reports')
      .select('patient_id')
      .eq('id', id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    // Missing and not-yours are answered identically so ids can't be probed.
    const denied = () => res.status(403).json({ error: 'You do not have access to this report.' });
    if (!row?.patient_id) return denied();

    const ownerId = row.patient_id;
    if (ownerId !== callerId) {
      let linked = false;
      try {
        if (req.user.role === 'doctor') {
          linked = await isDoctorLinkedToPatient(callerId, ownerId);
        } else if (req.user.role === 'patient') {
          linked = await isPatientLinkedToFamilyMember(callerId, ownerId);
        }
      } catch (err) {
        console.error(`[POST /api/reports/index] link check failed for ${req.user.role} ${callerId}:`, err);
        return res.status(500).json({ error: 'Could not verify access. Please try again.' });
      }
      if (!linked) return denied();
    }

    const report = await getTimelineReport(ownerId, id);
    if (!report) return denied();

    const result = await processReportEmbeddings({
      id: report.id,
      // Indexed under the report's owner (the patient), not the caller — a
      // doctor or family admin saving on a patient's behalf must not file the
      // chunks under their own account.
      user_id: ownerId,
      title: report.title,
      diagnosis: report.diagnosis,
      medicines: report.medicines,
      notes: report.notes,
      report_date: report.reportDate,
    });
    return res.status(200).json({ embeddings: result });
  } catch (err) {
    // The report itself already saved fine via backend/ — embedding failing
    // here just means it won't be searchable yet. Surface clearly rather
    // than pretending it worked.
    console.error(`[POST /api/reports/index] failed for report ${id}:`, err);
    return res.status(207).json({
      embeddings: null,
      warning: 'Report saved, but indexing for search failed. It may not appear in search yet.',
    });
  }
});

// There is deliberately no DELETE /index/:id: report_embeddings.report_id is
// `on delete cascade`, so deleting a report already removes its chunks, and
// an unscoped delete-by-id endpoint only offered a way to wipe other
// users' index entries.

export default router;
