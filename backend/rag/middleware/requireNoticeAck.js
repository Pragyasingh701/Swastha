import { hasAcknowledged } from '../../db/aiNoticeAcknowledgements.js';
import { AI_NOTICE_VERSION } from '../config/aiNotices.js';

/**
 * Blocks a request until the CALLER (req.user.userId — never a body-supplied
 * target patient) has acknowledged `feature`'s AI-processing notice at the
 * current AI_NOTICE_VERSION. Enforced here, server-side, because the UI-side
 * "show once" gate is trivially bypassable (replay the request, skip the
 * modal in a scripted client) and this notice is a consent/disclosure
 * requirement, not just a UX nicety.
 *
 * 403 with a machine-readable code (rather than a plain error string) when
 * unacknowledged, so the frontend can distinguish "please show the notice
 * modal" from any other 403 in the app and re-show it without guessing from
 * message text.
 *
 * A lookup failure (DB error) returns 500, not a silent allow — an
 * acknowledgement that couldn't be verified is not the same as one that
 * exists, and this is a healthcare app: fail closed.
 *
 * Must run after requireAuth (reads req.user.userId).
 *
 * @param {'ask_swastha'|'voice_intake'} feature
 */
export function requireNoticeAck(feature) {
  return async function (req, res, next) {
    const userId = req.user?.userId;

    try {
      const acknowledged = await hasAcknowledged(userId, feature, AI_NOTICE_VERSION);
      if (!acknowledged) {
        return res.status(403).json({
          error: 'You must acknowledge how this feature uses AI before continuing.',
          code: 'AI_NOTICE_ACK_REQUIRED',
          feature,
          notice_version: AI_NOTICE_VERSION,
        });
      }
      next();
    } catch (err) {
      console.error(`[requireNoticeAck] acknowledgement check failed for user ${userId}, feature ${feature}:`, err);
      return res.status(500).json({ error: 'Could not verify notice acknowledgement. Please try again.' });
    }
  };
}

export default requireNoticeAck;
