import express from 'express';
import { recordFeedback } from '../../db/askSwasthaFeedback.js';
import { requireAuth } from '../middleware/auth.js';
import { createUserRateLimiter } from '../middleware/rateLimit.js';
import { FEEDBACK_RATE_LIMIT_WINDOW_MS, FEEDBACK_RATE_LIMIT_MAX } from '../config/env.js';

const router = express.Router();

const feedbackRateLimiter = createUserRateLimiter({
  windowMs: FEEDBACK_RATE_LIMIT_WINDOW_MS,
  max: FEEDBACK_RATE_LIMIT_MAX,
});

const VALID_RATINGS = ['up', 'down'];
const VALID_MODES = ['full_context', 'retrieval', 'aggregate'];
const MAX_SOURCE_REPORT_IDS = 50;

/**
 * POST /api/search/feedback
 * Body: { rating: 'up'|'down', mode?, source_report_ids?, degraded? }
 *
 * user_id is ALWAYS read from the verified JWT (req.user.userId), never
 * from the request body — this is what makes "a caller can only submit
 * feedback for their own requests" hold: there is no field a client can
 * set to attribute a row to a different user. mode/source_report_ids/
 * degraded describe the answer the caller already received and is now
 * rating; they are client-echoed (this endpoint doesn't re-fetch or verify
 * a specific prior request), matching the same trust boundary the rest of
 * this app applies to client-supplied non-identity data.
 *
 * Never accepts or stores question/answer text — this is a rating, not a
 * transcript.
 */
router.post('/', requireAuth, feedbackRateLimiter, async (req, res) => {
  const { rating, mode, source_report_ids: sourceReportIds, degraded } = req.body || {};
  const userId = req.user.userId;

  if (!VALID_RATINGS.includes(rating)) {
    return res.status(400).json({ error: `rating must be one of: ${VALID_RATINGS.join(', ')}` });
  }
  if (mode !== undefined && mode !== null && !VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${VALID_MODES.join(', ')}, or omitted` });
  }
  if (sourceReportIds !== undefined) {
    if (!Array.isArray(sourceReportIds) || sourceReportIds.some((id) => typeof id !== 'string')) {
      return res.status(400).json({ error: 'source_report_ids must be an array of strings if provided' });
    }
    if (sourceReportIds.length > MAX_SOURCE_REPORT_IDS) {
      return res.status(400).json({ error: `source_report_ids must have ${MAX_SOURCE_REPORT_IDS} or fewer entries` });
    }
  }

  try {
    await recordFeedback({
      userId,
      rating,
      mode: mode || null,
      sourceReportIds: sourceReportIds || [],
      degraded: Boolean(degraded),
    });
    return res.status(200).json({ stored: true });
  } catch (err) {
    console.error(`[POST /api/search/feedback] failed for user ${userId}:`, err);
    return res.status(500).json({ error: 'Could not record feedback. Please try again.' });
  }
});

export default router;
