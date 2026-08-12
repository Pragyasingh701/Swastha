import express from 'express';
import { summarizeReport } from '../services/summaryService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/summarize
 * Called by backend/routes/reports.js right after a report is
 * created/updated (backend forwards the same user JWT it already has —
 * this is a server-to-server call, not a direct browser call). Body is
 * the report's fields; returns the generated summary text. Caller is
 * responsible for storing it — this endpoint doesn't touch the database.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const summary = await summarizeReport(req.body || {});
    return res.status(200).json({ summary });
  } catch (err) {
    console.error(`[POST /api/summarize] failed for user ${req.user.userId}:`, err);
    return res.status(500).json({
      error: 'Could not generate AI summary for this report.',
    });
  }
});

export default router;
