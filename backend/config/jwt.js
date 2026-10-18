// One place for the JWT signing secret and the session token format.
//
// The secret is read when first used (so dotenv has already run) and there is
// deliberately NO fallback value: each route file used to carry its own
// `process.env.JWT_SECRET || 'swastha_dev_secret_key_2026'`, a secret committed
// to the repo that would have silently signed and accepted tokens if the
// variable were ever missing. Failing loudly is the safe behaviour.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// How long a login lasts. Tokens can't be revoked, so a shorter life is the
// main limit on a stolen or forgotten session. A normal login lasts a day; one
// where the user ticked "Remember me" on the login screen lasts a week.
// Both can be changed with environment variables; there is no inactivity logout.
export function sessionTokenTtl() {
  return process.env.SESSION_TOKEN_TTL || '24h';
}

export function rememberMeTokenTtl() {
  return process.env.REMEMBER_ME_TOKEN_TTL || '7d';
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set.');
  }
  return secret;
}

export function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

// The logged-in user from a request's `Authorization: Bearer ...` header, or null when there
// is no token or it is invalid or expired. Routes that need a 401 call this and check the result.
export function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return null;
  }

  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

// `expiresIn` is whatever jsonwebtoken accepts ('24h', '7d', or seconds as a number).
export function signAuthToken({ userId, email, role, vaultId = null, expiresIn }) {
  return jwt.sign({ userId, email, role, vaultId }, getJwtSecret(), { expiresIn: expiresIn || sessionTokenTtl() });
}

// Short-lived, single-purpose tokens (for example proof that a clinic code was
// entered). Signed with a key derived from the secret AND the purpose, so one
// of these can never be accepted as a login session token, or as a token for a
// different purpose.
function purposeSecret(purpose) {
  return crypto.createHmac('sha256', getJwtSecret()).update(`purpose:${purpose}`).digest('hex');
}

export function signPurposeToken(purpose, payload, expiresIn) {
  return jwt.sign({ ...payload, purpose }, purposeSecret(purpose), { expiresIn });
}

export function verifyPurposeToken(purpose, token) {
  const decoded = jwt.verify(token, purposeSecret(purpose));
  if (decoded?.purpose !== purpose) {
    throw new Error('Wrong token purpose.');
  }
  return decoded;
}
