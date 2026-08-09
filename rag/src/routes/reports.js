import express from 'express';
import { processReportEmbeddings, deleteReportEmbeddings } from '../services/embeddingService.js';
import { requireAuth } from '../middleware/auth.js';

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
 * Chunk + embed its notes so it becomes searchable. user_id comes from the
 * JWT, not the body.
 */
router.post('/index', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { id, notes, reportDate, report_date } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'id (report id) is required' });
  }

  try {
    const result = await processReportEmbeddings({
      id,
      user_id: userId,
      notes,
      report_date: report_date || reportDate,
    });
    return res.status(200).json({ embeddings: result });
  } catch (err) {
    // The report itself already saved fine via backend/ — embedding failing
    // here just means it won't be searchable yet. Surface clearly rather
    // than pretending it worked.
    console.error(`[POST /api/reports/index] failed for report ${id}:`, err);
    return res.status(207).json({
      embeddings: null,
      warning: `Report saved, but indexing for search failed: ${err.message}`,
    });
  }
});

/**
 * DELETE /api/reports/index/:id
 * Remove a report's embeddings — call this alongside backend's
 * DELETE /api/reports/:id so deleted reports stop showing up in search.
 */
router.delete('/index/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'id (report id) is required' });
  }

  try {
    await deleteReportEmbeddings(id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[DELETE /api/reports/index/${id}] failed:`, err);
    return res.status(500).json({ error: 'Failed to remove report from search index' });
  }
});

export default router;
