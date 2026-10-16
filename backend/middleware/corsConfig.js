// CORS allow-list. The API is called from the Vercel-hosted SPA (and from
// localhost in development); nothing else has a reason to call it from a
// browser, and an open policy lets any website a user happens to visit hit
// the unauthenticated endpoints (login, send-otp, ...) from their browser.
//
// Allowed origins come from FRONTEND_URL (the same variable the emailed links
// use) plus an optional comma-separated CORS_ORIGINS for extras such as
// Vercel preview deployments. Localhost dev origins are added outside
// production.
//
// Rollout safety: if neither variable is set the policy stays open (the old
// behaviour) and logs a warning once, rather than breaking a deployment that
// hasn't been configured yet.
import cors from 'cors';

function toOrigin(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function buildAllowedOrigins(env = process.env) {
  const origins = new Set();
  const front = toOrigin(env.FRONTEND_URL);
  if (front) origins.add(front);
  for (const entry of String(env.CORS_ORIGINS || '').split(',')) {
    const origin = toOrigin(entry);
    if (origin) origins.add(origin);
  }
  if (origins.size > 0 && env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
  }
  return origins;
}

let warned = false;

export function corsMiddleware() {
  return cors((req, callback) => {
    const allowed = buildAllowedOrigins();
    const origin = req.headers.origin;

    // No Origin header: not a browser cross-origin request (server-to-server
    // calls such as the in-process RAG loopback, curl, health checks).
    if (!origin) return callback(null, { origin: false });

    if (allowed.size === 0) {
      if (!warned) {
        warned = true;
        console.warn(
          '[cors] Neither FRONTEND_URL nor CORS_ORIGINS is set — allowing ALL origins. ' +
          'Set FRONTEND_URL to the deployed frontend URL to restrict this.'
        );
      }
      return callback(null, { origin: true });
    }

    return callback(null, { origin: allowed.has(origin) });
  });
}
