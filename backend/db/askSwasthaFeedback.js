import supabase from '../config/supabase.js';

const TABLE = 'ask_swastha_feedback';
const VALID_RATINGS = ['up', 'down'];
// Kept in sync with rag/routes/feedback.js's own VALID_MODES and the
// ask_swastha_feedback table's mode check constraint (see migration
// 20261001000000_add_last_report_mode.sql) — see that route's comment for
// why this list existing in three places independently is exactly how a new
// mode value breaks feedback storage silently until all three are updated.
const VALID_MODES = ['full_context', 'retrieval', 'aggregate', 'last_report'];

/**
 * Stores one thumbs up/down rating on an Ask Swastha answer. `userId` is
 * always the CALLER's own id (the route reads it from the verified JWT,
 * never from the request body) — that is what makes "a caller can only
 * submit feedback for their own requests" hold: nobody can attribute a row
 * to a different user_id than the one they authenticated as.
 *
 * Never stores question/answer text — only rating + a few shape fields
 * (mode, which reports were cited, whether the answer was a degraded
 * fallback) describing the response the caller is rating.
 *
 * @param {{
 *   userId: string,
 *   rating: 'up'|'down',
 *   mode?: 'full_context'|'retrieval'|'aggregate'|'last_report'|null,
 *   sourceReportIds?: string[],
 *   degraded?: boolean,
 * }} entry
 */
export async function recordFeedback({ userId, rating, mode = null, sourceReportIds = [], degraded = false }) {
  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }
  if (!userId) {
    throw new Error('recordFeedback: userId is required');
  }
  if (!VALID_RATINGS.includes(rating)) {
    throw new Error(`recordFeedback: rating must be one of: ${VALID_RATINGS.join(', ')}`);
  }
  if (mode !== null && !VALID_MODES.includes(mode)) {
    throw new Error(`recordFeedback: mode must be one of: ${VALID_MODES.join(', ')}, or null`);
  }

  const { error } = await supabase.from(TABLE).insert({
    user_id: userId,
    rating,
    mode,
    source_report_ids: Array.isArray(sourceReportIds) ? sourceReportIds.map(String) : [],
    degraded: Boolean(degraded),
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`recordFeedback: failed to store feedback: ${error.message}`);
  }
}

export default { recordFeedback };
