import crypto from 'crypto';
import express from 'express';
import { generateLabInsights } from '../services/labInsightsService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireNoticeAck } from '../middleware/requireNoticeAck.js';

const router = express.Router();

// The same records give the same score. Keeping the last result for a day (keyed
// by user and a hash of the records) means a score does not change from visit to
// visit unless the records did, and a page reload does not cost another AI call.
const INSIGHTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const INSIGHTS_CACHE_MAX_ENTRIES = 200;
const insightsCache = new Map();

function insightsCacheKey(userId, reports) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(reports)).digest('hex');
  return `${userId}:${digest}`;
}

function readCachedInsights(key) {
  const hit = insightsCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > INSIGHTS_CACHE_TTL_MS) {
    insightsCache.delete(key);
    return null;
  }
  return hit.insights;
}

function cacheInsights(key, insights) {
  insightsCache.set(key, { at: Date.now(), insights });
  while (insightsCache.size > INSIGHTS_CACHE_MAX_ENTRIES) {
    insightsCache.delete(insightsCache.keys().next().value); // oldest first
  }
}

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
router.post('/', requireAuth, requireNoticeAck('ask_swastha'), async (req, res) => {
  const reports = Array.isArray(req.body?.reports) ? req.body.reports : [];

  if (reports.length === 0) {
    return res.status(400).json({ error: 'At least one lab report is required.' });
  }

  try {
    const key = insightsCacheKey(req.user.userId, reports);
    let insights = readCachedInsights(key);
    if (!insights) {
      insights = await generateLabInsights(reports);
      cacheInsights(key, insights);
    }
    return res.status(200).json({ insights });
  } catch (err) {
    console.error(`[POST /api/lab-insights] failed for user ${req.user.userId}:`, err);
    return res.status(500).json({ error: 'Could not generate lab insights.' });
  }
});

export default router;
