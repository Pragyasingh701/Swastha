import express from 'express';
import { summarizePatientTimeline } from '../services/patientSummaryService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/patient-summary
 * Called by backend/routes/doctorPatients.js, which fetches the target
 * patient's full timeline (after checking the caller-doctor has an
 * accepted link to them) and forwards it here — this service doesn't own
 * the `reports` table or the doctor-patient link check (same boundary as
 * routes/summarize.js and routes/labInsights.js).
 *
 * Body: { patientName, reports: [ { title, category, doctor, hospital,
 *   reportDate, diagnosis, medicines, notes, analysis }, ... ] }
 */
router.post('/', requireAuth, async (req, res) => {
  const { patientName } = req.body || {};
  const reports = Array.isArray(req.body?.reports) ? req.body.reports : [];

  if (reports.length === 0) {
    return res.status(400).json({ error: 'At least one report is required.' });
  }

  try {
    const summary = await summarizePatientTimeline(patientName, reports);
    return res.status(200).json({ summary });
  } catch (err) {
    console.error(`[POST /api/patient-summary] failed for user ${req.user.userId}:`, err);
    return res.status(500).json({ error: 'Could not generate a patient summary.' });
  }
});

export default router;
