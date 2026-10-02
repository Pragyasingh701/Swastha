import express from 'express';
import { recordFeedback } from '../../db/askSwasthaFeedback.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const VALID_RATINGS = ['up', 'down'];
// Kept in sync with searchService.js's possible `mode` return values and
// the ask_swastha_feedback table's mode check constraint (see migration
// 20261001000000_add_last_report_mode.sql) — a mode value produced by the
// search services but missing here gets silently rejected as a 400 on every
// feedback submission for that answer type, which is exactly how
// 'last_report' feedback broke when that mode was added without updating
// this list too.
const VALID_MODES = ['full_context', 'retrieval', 'aggregate', 'last_report'];
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
router.post('/', requireAuth, async (req, res) => {
  const { rating, mode, source_report_ids: sourceReportIds, degraded } = req.body || {};
  const userId = req.user.userId;

  if (!VALID_RATINGS.includes(rating)) {
    return res.status(400).json({ error: `rating must be one of: ${VALID_RATINGS.join(', ')}` });
  }
  if (mode !== undefined && mode !== null && !VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${VALID_MODES.join(', ')}, or omitted` });
  }
  // reports.id is a Postgres bigint, so a `report_id` the client echoes back
  // (read from a prior search response's `sources`) can arrive here as a JS
  // number, not just a string, depending on how it was read/round-tripped on
  // the frontend — accept either and normalize to strings below, rather than
  // rejecting a legitimate numeric id. recordFeedback/the DB column already
  // expect/store strings (text[]), so this is the one place that needs to
  // bridge the two.
  if (sourceReportIds !== undefined) {
    if (!Array.isArray(sourceReportIds) || sourceReportIds.some((id) => typeof id !== 'string' && typeof id !== 'number')) {
      return res.status(400).json({ error: 'source_report_ids must be an array of strings or numbers if provided' });
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
      sourceReportIds: sourceReportIds ? sourceReportIds.map(String) : [],
      degraded: Boolean(degraded),
    });
    return res.status(200).json({ stored: true });
  } catch (err) {
    console.error(`[POST /api/search/feedback] failed for user ${userId}:`, err);
    return res.status(500).json({ error: 'Could not record feedback. Please try again.' });
  }
});

export default router;
