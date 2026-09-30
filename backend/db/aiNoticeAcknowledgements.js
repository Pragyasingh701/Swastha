import supabase from '../config/supabase.js';
import { AI_NOTICE_VERSION } from '../rag/config/aiNotices.js';

const TABLE = 'ai_notice_acknowledgements';

/**
 * Whether `userId` has already acknowledged `feature` at exactly
 * `noticeVersion` — a row recorded against an older version does NOT count,
 * which is what makes bumping AI_NOTICE_VERSION re-prompt everyone.
 *
 * Throws on a real DB error (never swallowed) — the caller (requireNoticeAck)
 * must 500 rather than silently allow through when the check itself fails,
 * since a failed lookup is not evidence of an acknowledgement.
 *
 * @param {string} userId
 * @param {'ask_swastha'|'voice_intake'} feature
 * @param {number} noticeVersion
 * @returns {Promise<boolean>}
 */
export async function hasAcknowledged(userId, feature, noticeVersion) {
  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('feature', feature)
    .eq('notice_version', noticeVersion)
    .limit(1);

  if (error) {
    throw new Error(`hasAcknowledged: failed to check acknowledgement: ${error.message}`);
  }

  return (data || []).length > 0;
}

/**
 * Records that `userId` accepted `feature`'s notice at `noticeVersion`.
 * Idempotent: acknowledging the same (user, feature, version) twice is not
 * an error (the unique constraint would reject a duplicate insert, which is
 * treated as success here — the end state, "acknowledged", is unchanged).
 *
 * @param {string} userId
 * @param {'ask_swastha'|'voice_intake'} feature
 * @param {number} noticeVersion
 */
export async function recordAcknowledgement(userId, feature, noticeVersion) {
  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  const { error } = await supabase.from(TABLE).insert({
    user_id: userId,
    feature,
    notice_version: noticeVersion,
    created_at: new Date().toISOString(),
  });

  // Postgres unique_violation — this exact acknowledgement already exists.
  // Not an error from the caller's point of view: the desired end state
  // (a row proving this user accepted this version) already holds.
  if (error && error.code !== '23505') {
    throw new Error(`recordAcknowledgement: failed to store acknowledgement: ${error.message}`);
  }
}

/**
 * Single shared "may this caller proceed" check, used by every entry point
 * that must be gated on AI_NOTICE_VERSION acknowledgement before it can run
 * (rag/middleware/requireNoticeAck.js's Express middleware for
 * searchChat.js/search.js/intake.js, and routes/clinic.js's verify-otp,
 * which creates an intake session by a different path than intake.js's own
 * /start and previously duplicated this same check inline). Framework-
 * agnostic on purpose — it returns a plain result instead of writing to
 * `res` itself, so a plain Express route handler (clinic.js) and an Express
 * middleware factory (requireNoticeAck.js) can both build their own
 * response shape (clinic.js uses `message`, the rag sub-app uses `error`)
 * from the same check.
 *
 * Fail-closed: a lookup failure (DB error) is reported as `status: 500`,
 * never treated as an implicit allow.
 *
 * @param {string} userId
 * @param {'ask_swastha'|'voice_intake'} feature
 * @returns {Promise<
 *   { ok: true } |
 *   { ok: false, status: 403, code: 'AI_NOTICE_ACK_REQUIRED', feature: string, noticeVersion: number } |
 *   { ok: false, status: 500 }
 * >}
 */
export async function checkNoticeAck(userId, feature) {
  try {
    const acknowledged = await hasAcknowledged(userId, feature, AI_NOTICE_VERSION);
    if (!acknowledged) {
      return { ok: false, status: 403, code: 'AI_NOTICE_ACK_REQUIRED', feature, noticeVersion: AI_NOTICE_VERSION };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[checkNoticeAck] acknowledgement check failed for user ${userId}, feature ${feature}:`, err);
    return { ok: false, status: 500 };
  }
}

export default { hasAcknowledged, recordAcknowledgement, checkNoticeAck };
