// One place for the JWT signing secret and the session token format.
//
// The secret is read when first used (so dotenv has already run) and there is
// deliberately NO fallback value: each route file used to carry its own
// `process.env.JWT_SECRET || 'swastha_dev_secret_key_2026'`, a secret committed
// to the repo that would have silently signed and accepted tokens if the
// variable were ever missing. Failing loudly is the safe behaviour.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export const SESSION_TOKEN_TTL = '7d';

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

export function signAuthToken({ userId, email, role, vaultId = null }) {
  return jwt.sign({ userId, email, role, vaultId }, getJwtSecret(), { expiresIn: SESSION_TOKEN_TTL });
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
