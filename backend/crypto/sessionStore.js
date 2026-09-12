// In-memory store for wire-crypto sessions established via
// POST /api/crypto/handshake (routes/crypto.js). Deliberately decoupled
// from JWT/user identity — this is a transport-channel session ("this
// browser tab has a secure channel"), not a login session, so a second
// device/tab handshaking doesn't stomp the first one's key the way keying
// on userId would have. Same global-guard pattern as
// routes/auth.js's otpStoreRaw, so a nodemon dev-reload doesn't spawn a
// second sweep interval or silently drop live sessions.
import { randomUUID } from 'node:crypto';

if (!global.__cryptoSessionStore) {
  global.__cryptoSessionStore = new Map();
}
const sessions = global.__cryptoSessionStore;

// Mirrors the existing doctor_patient.access_expires_at 24h precedent
// (backend/db/doctorPatients.js) rather than inventing a new duration.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

if (!global.__cryptoSessionSweepInterval) {
  global.__cryptoSessionSweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt < now) sessions.delete(id);
    }
  }, 5 * 60 * 1000);
  // Purely a background GC sweep — must not keep the process alive on its
  // own (matters for `node --test`/scripts that import app.js and expect
  // to exit once their own work is done).
  global.__cryptoSessionSweepInterval.unref?.();
}

export function createSession(key) {
  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  sessions.set(sessionId, { key, createdAt: now, expiresAt });
  return { sessionId, expiresAt };
}

// Returns the session's derived AES-GCM CryptoKey, or null if the id is
// unknown or expired (server restart wipes this Map — same accepted
// in-memory-state risk routes/auth.js's OTP/reset-token stores already have).
export function getSessionKey(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session.key;
}
