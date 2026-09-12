// Lazy ECDH handshake + module-level session key holder for the wire-crypto
// boundary. Lives purely in JS module state — never localStorage/
// sessionStorage — so it doesn't reintroduce the exposure this project is
// closing. Resets naturally on a full page reload; survives client-side
// route changes and login/logout/token-refresh, since the transport session
// is independent of which identity (if any) is authenticated on top of it.
import { generateEcdhKeyPair, exportRawPublicKey, importRawPublicKey, deriveSessionKey } from './crypto.js';

export class PiiSessionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PiiSessionError';
    if (cause) this.cause = cause;
  }
}

// Keyed by origin, not a bare singleton — collapses to one entry today
// since the rag sub-app is mounted at the same origin as the main API, but
// costs nothing to keep origin-keyed if that topology ever changes back.
const sessionsByOrigin = new Map(); // origin -> { key, sessionId }
const inFlightByOrigin = new Map(); // origin -> Promise<{ key, sessionId }>

function resolveOrigin(baseUrl) {
  try {
    return new URL(baseUrl || '/', window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

async function handshake(origin) {
  const keyPair = await generateEcdhKeyPair();
  const clientPublicKey = await exportRawPublicKey(keyPair.publicKey);

  let res;
  try {
    // The handshake route lives once, on the main backend, at /api/crypto —
    // not under whatever domain-specific baseUrl (e.g. the /rag mount)
    // triggered this call, so it's addressed by origin + this fixed path,
    // not by appending onto that baseUrl.
    res = await fetch(`${origin}/api/crypto/handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientPublicKey }),
    });
  } catch (err) {
    throw new PiiSessionError('Unable to reach the server to establish a secure connection.', err);
  }
  if (!res.ok) {
    throw new PiiSessionError(`Secure connection handshake failed (HTTP ${res.status}).`);
  }

  const data = await res.json();
  const serverPublicKey = await importRawPublicKey(data.serverPublicKey);
  const key = await deriveSessionKey(keyPair.privateKey, serverPublicKey);
  return { key, sessionId: data.sessionId };
}

/**
 * Lazily establishes (once per origin, per page load) the wire-crypto
 * session used to encrypt/decrypt designated PII fields. Concurrent early
 * callers share one in-flight handshake instead of firing two. Fails
 * closed: throws PiiSessionError rather than silently sending plaintext.
 */
export async function ensureSession(baseUrl) {
  const origin = resolveOrigin(baseUrl);

  const existing = sessionsByOrigin.get(origin);
  if (existing) return existing;

  const inFlight = inFlightByOrigin.get(origin);
  if (inFlight) return inFlight;

  const promise = handshake(origin)
    .then((session) => {
      sessionsByOrigin.set(origin, session);
      return session;
    })
    .finally(() => {
      inFlightByOrigin.delete(origin);
    });
  inFlightByOrigin.set(origin, promise);
  return promise;
}

// Drops a cached session (e.g. after the server returns 401
// ENC_SESSION_EXPIRED — the process restarted and its in-memory session
// map no longer has this id) so the next ensureSession() call re-handshakes
// instead of reusing a key the server has already forgotten.
export function invalidateSession(baseUrl) {
  sessionsByOrigin.delete(resolveOrigin(baseUrl));
}
