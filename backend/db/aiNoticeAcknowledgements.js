import supabase from '../config/supabase.js';

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

export default { hasAcknowledged, recordAcknowledgement };
