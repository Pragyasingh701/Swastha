// Recursive JSON walker + the encrypt/decrypt entry points client.js calls.
// Matches keys against pii/fields.js at any nesting depth or array
// position, so an array of family members or a nested cert-extracted-data
// blob is covered automatically without being named individually here.
import { matchSensitiveField } from './fields.js';
import { encryptString, decryptString } from './crypto.js';
import { ensureSession } from './session.js';

const MAX_DEPTH = 12;

function isEnvelope(value) {
  return !!value && typeof value === 'object' &&
    value.__enc === 1 && typeof value.iv === 'string' && typeof value.data === 'string';
}

async function walk(value, transform, depth) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => walk(item, transform, depth + 1)));
  }
  const out = {};
  const jobs = [];
  for (const [key, val] of Object.entries(value)) {
    const match = matchSensitiveField(key);
    if (match) {
      // Matched keys are treated as one opaque unit and NOT recursed into
      // further, even when the value is itself an object (e.g. `metadata`).
      jobs.push(Promise.resolve(transform(val, match)).then((res) => { out[key] = res; }));
    } else if (val !== null && typeof val === 'object') {
      jobs.push(walk(val, transform, depth + 1).then((res) => { out[key] = res; }));
    } else {
      out[key] = val;
    }
  }
  await Promise.all(jobs);
  return out;
}

function makeEncryptTransform(key) {
  return async (value, match) => {
    // Nothing to protect — pass through so optional/absent fields don't
    // balloon into fake ciphertext envelopes.
    if (value === null || value === undefined || value === '') return value;
    const wasSerialized = match.serialize && typeof value !== 'string';
    const plaintext = wasSerialized ? JSON.stringify(value) : String(value);
    const { iv, data } = await encryptString(key, plaintext);
    return { __enc: 1, iv, data, wasSerialized };
  };
}

function makeDecryptTransform(key) {
  return async (value) => {
    // Not our envelope shape — nothing to decrypt (e.g. a field the server
    // didn't have a session for, or a plain value). Leave it as received.
    if (!isEnvelope(value)) return value;
    const plaintext = await decryptString(key, value);
    return value.wasSerialized ? JSON.parse(plaintext) : plaintext;
  };
}

// Encrypts every designated sensitive field in `value` (any nesting depth /
// array position), using the session key for `baseUrl`'s origin — performs
// the ECDH handshake first if this is the first call for that origin.
export async function encryptPiiFields(value, baseUrl) {
  const { key } = await ensureSession(baseUrl);
  return walk(value, makeEncryptTransform(key), 0);
}

// Decrypts every encrypted-envelope-shaped field in `value`. Safe to call
// on a response that was never encrypted (e.g. the server had no session
// for this request) — non-envelope values just pass through untouched.
export async function decryptPiiFields(value, baseUrl) {
  const { key } = await ensureSession(baseUrl);
  return walk(value, makeDecryptTransform(key), 0);
}

// Packs a small object (e.g. { email, userId }) into a single encrypted
// envelope string suitable for the X-Enc-Params request header — used
// where PII needs to travel as a query-param override rather than in a
// JSON body (see api/reports.js's getTimelineReports/deleteTimelineReport).
// This is one whole-object envelope, unlike encryptPiiFields' per-field
// walk, since it's just 1-2 small values bundled together, not a large
// mixed object of sensitive + non-sensitive fields.
export async function encryptParamsEnvelope(paramsObject, baseUrl) {
  const { key } = await ensureSession(baseUrl);
  const json = JSON.stringify(paramsObject);
  const { iv, data } = await encryptString(key, json);
  return JSON.stringify({ __enc: 1, iv, data, wasSerialized: true });
}
