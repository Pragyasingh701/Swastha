// The wire-format PII encryption boundary. One middleware, `piiWireBoundary`,
// mounted once in server.js right after express.json(...) and before any
// route: it decrypts designated sensitive fields in req.body (and an
// optional X-Enc-Params header carrying encrypted query-param overrides)
// immediately, then monkey-patches res.json so every existing
// `res.json(...)` call site in every route file transparently encrypts
// matching fields before the response is actually sent. No controller or DB
// code needs to change — see README's "Wire-format PII encryption" section
// for the full threat model and what this does/doesn't protect against.
import { getSessionKey } from '../crypto/sessionStore.js';
import { encryptString, decryptString } from '../crypto/webcrypto.js';
import { walkTree } from '../crypto/piiWalker.js';

const SESSION_HEADER = 'x-enc-session-id';
const PARAMS_HEADER = 'x-enc-params';

function isEnvelope(value) {
  return !!value && typeof value === 'object' &&
    value.__enc === 1 && typeof value.iv === 'string' && typeof value.data === 'string';
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
    // Not our envelope shape — a legacy/non-upgraded client, or a field
    // that simply wasn't sent as ciphertext. Leave it exactly as received
    // rather than erroring, so partial rollouts and optional fields work.
    if (!isEnvelope(value)) return value;
    const plaintext = await decryptString(key, value);
    return value.wasSerialized ? JSON.parse(plaintext) : plaintext;
  };
}

// A matched-field value passes through completely unchanged — used when
// there's no crypto session, so PII fields stay plaintext (legacy
// fallback) while STRIP_RESPONSE_KEYS (password_hash/passwordHash) still
// gets removed, since that walk() already strips those unconditionally
// before this transform is ever called (see piiWalker.js's isStripField
// check). Stripping must not be gated behind whether a client opted into
// encryption — it's an unconditional response-safety fix.
const identityTransform = (value) => value;

/**
 * Global middleware. No X-Enc-Session-Id header on the request -> PII
 * fields pass through as plaintext in both directions (lets this ship with
 * zero behavior change until a client starts sending the header) — but
 * STRIP_RESPONSE_KEYS is still enforced on every response regardless (see
 * identityTransform above). Header present but unresolvable (expired
 * session / server restarted, since sessions live in-memory) -> 401
 * ENC_SESSION_EXPIRED, the signal a client uses to re-handshake and retry.
 */
export function piiWireBoundary(req, res, next) {
  const sessionId = req.headers[SESSION_HEADER];

  if (!sessionId) {
    req.__encSession = null;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      walkTree(body, identityTransform)
        .then((strippedBody) => originalJson(strippedBody))
        .catch((err) => {
          console.error('[piiWireBoundary] response strip failed:', err.message);
          originalJson(body);
        });
      return res;
    };
    return next();
  }

  const key = getSessionKey(sessionId);
  if (!key) {
    return res.status(401).json({
      code: 'ENC_SESSION_EXPIRED',
      message: 'Encrypted session expired or unknown. Please re-handshake and retry.',
    });
  }
  req.__encSession = { sessionId, key };

  const decrypt = makeDecryptTransform(key);

  (async () => {
    if (req.body && typeof req.body === 'object') {
      req.body = await walkTree(req.body, decrypt);
    }

    if (typeof req.headers[PARAMS_HEADER] === 'string') {
      const envelope = JSON.parse(req.headers[PARAMS_HEADER]);
      const decrypted = await decrypt(envelope, { serialize: true });
      if (decrypted && typeof decrypted === 'object') {
        Object.assign(req.query, decrypted);
      }
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const encrypt = makeEncryptTransform(key);
      walkTree(body, encrypt)
        .then((encryptedBody) => originalJson(encryptedBody))
        .catch((err) => {
          console.error('[piiWireBoundary] response encryption failed:', err.message);
          originalJson(body);
        });
      return res;
    };

    next();
  })().catch((err) => {
    console.error('[piiWireBoundary] request decryption failed:', err.message);
    res.status(400).json({ message: 'Malformed encrypted request.' });
  });
}

/**
 * For multipart/form-data routes only (Multer parses req.body AFTER
 * piiWireBoundary already ran, since Content-Type isn't application/json —
 * express.json() skips it, so req.body is still empty when the middleware
 * above executes). Route-specific upload middleware (e.g.
 * backend/routes/reports.js's handleReportFileUpload) calls this once,
 * right after its Multer callback fires, to unpack the one
 * `encryptedFields` form field the frontend attaches alongside a file
 * (frontend/src/api/pii/multipart.js) — decrypts it and merges its keys
 * into req.body, which the route handler then reads exactly as if the
 * whole request had arrived as unencrypted JSON.
 */
export async function decryptMultipartFields(req) {
  if (!req.__encSession || !req.body || typeof req.body.encryptedFields !== 'string') {
    return;
  }
  // `encryptedFields` is a JSON-stringified object that already went
  // through the same per-field walker as a JSON body would (frontend's
  // encryptPiiFields) — a mix of plain values (non-sensitive fields) and
  // per-field ciphertext envelopes (sensitive ones). walkTree here
  // decrypts just the envelopes, exactly like the main request-body path.
  const decrypt = makeDecryptTransform(req.__encSession.key);
  const parsed = JSON.parse(req.body.encryptedFields);
  const merged = await walkTree(parsed, decrypt);
  delete req.body.encryptedFields;
  if (merged && typeof merged === 'object') {
    Object.assign(req.body, merged);
  }
}
