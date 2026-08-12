import express from 'express';
import { generateLabInsights } from '../services/labInsightsService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/lab-insights
 * Called by backend/routes/labInsights.js, which fetches the caller's
 * reports and forwards only the Lab Report category ones here — this
 * service doesn't own the `reports` table (same boundary as
 * routes/summarize.js and routes/reports.js).
 *
 * Body: { reports: [ { title, doctor, hospital, reportDate, diagnosis,
 *   medicines, notes, analysis }, ... ] }
 */
router.post('/', requireAuth, async (req, res) => {
  const reports = Array.isArray(req.body?.reports) ? req.body.reports : [];

  if (reports.length === 0) {
    return res.status(400).json({ error: 'At least one lab report is required.' });
  }

  try {
    const insights = await generateLabInsights(reports);
    return res.status(200).json({ insights });
  } catch (err) {
    console.error(`[POST /api/lab-insights] failed for user ${req.user.userId}:`, err);
    return res.status(500).json({ error: 'Could not generate lab insights.' });
  }
});

export default router;
