import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { runWithRequestContext } from '../utils/requestContext.js';

// Mirrors backend/routes/reports.js's getAuthUser — this service verifies
// the same JWTs the main backend issues (same JWT_SECRET) so it can trust
// req.user without re-implementing login/registration here.
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  if (!req.user?.userId) {
    return res.status(401).json({ error: 'Invalid session token.' });
  }

  // Everything this request does from here on (including AI provider calls
  // made deep inside services) can look up who is calling and on which route,
  // for the AI request log.
  runWithRequestContext(
    { userId: req.user.userId, role: req.user.role || null, route: `${req.baseUrl || ''}${req.path || ''}`.slice(0, 120) },
    next
  );
}
