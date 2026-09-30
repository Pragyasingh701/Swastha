import { checkNoticeAck } from '../../db/aiNoticeAcknowledgements.js';

/**
 * Blocks a request until the CALLER (req.user.userId — never a body-supplied
 * target patient) has acknowledged `feature`'s AI-processing notice at the
 * current AI_NOTICE_VERSION. Enforced here, server-side, because the UI-side
 * "show once" gate is trivially bypassable (replay the request, skip the
 * modal in a scripted client) and this notice is a consent/disclosure
 * requirement, not just a UX nicety.
 *
 * Express wrapper around the shared checkNoticeAck (db/aiNoticeAcknowledgements.js)
 * — the actual "has this user acknowledged this version" logic and its
 * fail-closed-on-DB-error behavior live there, shared with
 * routes/clinic.js's verify-otp (the other entry point into voice intake,
 * which isn't an Express-middleware-shaped call site and builds its own
 * response body from the same check).
 *
 * 403 with a machine-readable code (rather than a plain error string) when
 * unacknowledged, so the frontend can distinguish "please show the notice
 * modal" from any other 403 in the app and re-show it without guessing from
 * message text.
 *
 * Must run after requireAuth (reads req.user.userId).
 *
 * @param {'ask_swastha'|'voice_intake'} feature
 */
export function requireNoticeAck(feature) {
  // Named (not an anonymous arrow/function expression) so it shows up as
  // "requireNoticeAckMiddleware" in an Express route's own middleware stack
  // (route.stack[n].name) — this is what lets
  // ask-swastha-notice-ack-audit.test.js verify a route is actually gated
  // by introspecting app._router directly, instead of hand-maintaining a
  // list of "routes I believe are gated" that could silently drift from
  // the real route table.
  return async function requireNoticeAckMiddleware(req, res, next) {
    const userId = req.user?.userId;
    const result = await checkNoticeAck(userId, feature);

    if (result.ok) {
      return next();
    }
    if (result.status === 403) {
      return res.status(403).json({
        error: 'You must acknowledge how this feature uses AI before continuing.',
        code: result.code,
        feature: result.feature,
        notice_version: result.noticeVersion,
      });
    }
    return res.status(500).json({ error: 'Could not verify notice acknowledgement. Please try again.' });
  };
}

export default requireNoticeAck;
