import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

// Keyed by the authenticated user (req.user.userId, set by requireAuth,
// which must run before this middleware on the route) so one doctor/patient
// hitting the cap doesn't affect anyone else behind the same NAT/proxy IP.
// Falls back to IP only for the (currently unused) case of an unauthenticated
// caller reaching one of these routes.
function keyByUser(req) {
  return req.user?.userId || ipKeyGenerator(req.ip);
}

/**
 * @param {{ windowMs: number, max: number }} opts
 */
export function createUserRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: keyByUser,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    },
  });
}
