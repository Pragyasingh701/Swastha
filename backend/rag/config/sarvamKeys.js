// Sarvam API key pool with failover, shared by ttsService and asrService.
//
// Why this exists: Sarvam's free tier gives each key a small credit pool
// (~₹100, shared across STT and TTS), which a few full voice sessions can
// exhaust. Rather than hand-editing .env and restarting mid-demo, several
// keys are supplied at once and the pool moves to the next one the moment
// the current key stops working.
//
// Mirrors the GEMINI_API_KEYS convention already used by config/env.js and
// the deadKeys/keyCursor rotation in config/aiClient.js — same idea
// (rotate all keys before giving up), scoped to Sarvam and kept separate
// because Sarvam's failure shapes and endpoints are its own.
//
// IMPORTANT — retirement is permanent for the process lifetime, by design:
// an exhausted free-tier key does not recover, so re-trying it would cost
// a wasted round-trip on every subsequent request. A restart resets the
// pool (a key that was rate-limited rather than truly spent gets another
// chance then).
//
// The key VALUE is never logged — keys are only ever referenced as
// key#N/M, the same discipline aiClient.js documents.

// Comma-separated SARVAM_API_KEYS is the real form; SARVAM_API_KEY
// (singular) is still accepted so a single-key setup keeps working.
function loadKeys() {
  return (process.env.SARVAM_API_KEYS || process.env.SARVAM_API_KEY || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

let keys = loadKeys();

// Indices of keys that returned an exhausted/invalid-shaped error. Skipped
// for the rest of the process.
const retired = new Set();

// Points at the key currently in use. Unlike aiClient.js's round-robin
// cursor, this only ever moves FORWARD past a retired key: with a metered
// credit pool you want to drain one key fully before touching the next,
// not spread usage evenly across all of them and exhaust them together.
let cursor = 0;

/**
 * The key to use right now, or null when every key is spent.
 * @returns {{ key: string, index: number, total: number } | null}
 */
export function currentKey() {
  if (keys.length === 0) keys = loadKeys(); // dotenv may load after import
  while (cursor < keys.length && retired.has(cursor)) cursor += 1;
  if (cursor >= keys.length) return null;
  return { key: keys[cursor], index: cursor, total: keys.length };
}

/**
 * Retire the key at `index` and advance to the next one.
 *
 * Call this ONLY for failures that mean "this key will not work again":
 * exhausted credit, revoked/invalid key. Transient failures (5xx, timeout,
 * network) must NOT retire a key — they say nothing about its validity,
 * and burning a good key on a blip would waste the pool.
 *
 * @param {number} index - which key failed (from currentKey()).
 * @param {string} reason - classified failure code, for the log line only.
 * @returns {boolean} true if another key is available after this one.
 */
export function retireKey(index, reason) {
  if (index == null || retired.has(index)) return currentKey() !== null;

  retired.add(index);
  const next = currentKey();

  // key#N/M only — never the key itself.
  console.warn(
    `[sarvam] key#${index + 1}/${keys.length} retired (${reason}). ` +
      (next
        ? `Switching to key#${next.index + 1}/${next.total}.`
        : 'No keys left — Sarvam unavailable until restart.')
  );

  return next !== null;
}

/**
 * Classify a Sarvam failure so logs say WHY a call failed, and so callers
 * know whether the key itself is finished. Shared by TTS and ASR so the two
 * cannot drift apart.
 *
 * Sarvam answers 403 for BOTH a bad key and an authenticated-but-forbidden
 * request, so the body's error.code is what separates them: treating every
 * 403 as KEY_DEAD would wrongly retire a live key for the rest of the process.
 */
export function classifySarvam(status, bodyText) {
  const body = (bodyText || '').toLowerCase();
  if (status === 429) return 'RATE_LIMIT';
  if (status === 403) {
    return body.includes('invalid_api_key_error') ? 'KEY_DEAD' : 'FORBIDDEN';
  }
  if (status === 401) return 'KEY_DEAD';
  if (status === 402 || body.includes('insufficient') || body.includes('quota')) return 'QUOTA_EXHAUSTED';
  if (status === 0) return 'NETWORK';
  if (status >= 500) return 'PROVIDER_ERROR';
  return 'BAD_REQUEST';
}

// Failures meaning "this key is finished": retire it and move to the next
// one in the pool. Everything else (5xx, timeout, network) says nothing about
// the key's validity and must not burn it.
export const KEY_EXHAUSTED_CODES = new Set(['KEY_DEAD', 'QUOTA_EXHAUSTED', 'RATE_LIMIT']);

/** Test seam — restores the pool to its initial state. */
export function __resetKeyPool() {
  retired.clear();
  cursor = 0;
  keys = loadKeys();
}

export default { currentKey, retireKey, classifySarvam, KEY_EXHAUSTED_CODES };
