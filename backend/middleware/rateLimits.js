// Rate limits for the public / abusable endpoints. Counters are kept in this
// process's memory — fine for the single Render instance this runs on, but
// they reset on restart and aren't shared between instances (move to a shared
// store such as Redis before scaling out).
//
// Mounted from app.js AFTER the wire-crypto boundary, so req.body is already
// decrypted and the per-email keys below can read it.
//
// Limits are deliberately generous per IP: a clinic's wifi puts many patients
// behind one address. The tight limits are keyed per email (or per IP+email),
// which is what actually stops guessing and mail-bombing without letting one
// attacker lock a real user out from a different address.
import jwt from 'jsonwebtoken';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const disabled = String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';
const generalMax = Number(process.env.RATE_LIMIT_GENERAL_MAX) || 3000;

function emailOf(req) {
  const email = req.body?.email;
  return typeof email === 'string' ? email.toLowerCase().trim().slice(0, 254) : '';
}

function make({ windowMs, max, message, keyGenerator, skip }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    skip: (req, res) => disabled || (skip ? skip(req, res) : false),
    handler: (req, res) => {
      res.status(429).json({ message });
    },
  });
}

const byIp = (req) => ipKeyGenerator(req.ip);
const byIpAndEmail = (req) => `${ipKeyGenerator(req.ip)}|${emailOf(req)}`;
// Requests with no email in the body share one bucket per IP (they'd be
// rejected as invalid anyway) rather than all landing in a single global key.
const byEmail = (req) => emailOf(req) || `noemail|${ipKeyGenerator(req.ip)}`;

const TOO_MANY = 'Too many attempts. Please wait a few minutes and try again.';

export const limiters = {
  // Password guessing. Per IP+email so an attacker can't lock the real owner
  // out from elsewhere; the looser per-email cap bounds a distributed attempt.
  loginByIpAndEmail: make({ windowMs: 15 * MINUTE, max: 10, message: TOO_MANY, keyGenerator: byIpAndEmail }),
  loginByEmail: make({ windowMs: HOUR, max: 40, message: TOO_MANY, keyGenerator: byEmail }),

  register: make({ windowMs: HOUR, max: 20, message: TOO_MANY, keyGenerator: byIp }),

  // Anything that sends an email: stops mail-bombing an address and burning
  // the Brevo quota.
  emailByIp: make({ windowMs: 10 * MINUTE, max: 30, message: TOO_MANY, keyGenerator: byIp }),
  emailByEmail: make({
    windowMs: 10 * MINUTE,
    max: 6,
    message: 'We already sent several emails to this address. Please check your inbox, or wait a few minutes before trying again.',
    keyGenerator: byEmail,
  }),
  forgotByEmail: make({
    windowMs: HOUR,
    max: 4,
    message: 'We already sent several reset emails to this address. Please check your inbox, or try again later.',
    keyGenerator: byEmail,
  }),

  // Guessing a code / reset token.
  verifyByIp: make({ windowMs: 10 * MINUTE, max: 60, message: TOO_MANY, keyGenerator: byIp }),
  resetByIp: make({ windowMs: HOUR, max: 30, message: TOO_MANY, keyGenerator: byIp }),
  googleByIp: make({ windowMs: 10 * MINUTE, max: 60, message: TOO_MANY, keyGenerator: byIp }),

  // Unauthenticated, and each call allocates a stored key.
  handshakeByIp: make({ windowMs: 10 * MINUTE, max: 120, message: TOO_MANY, keyGenerator: byIp }),

  // Doctor -> patient-code lookups: 6-digit codes are guessable by brute
  // force, so cap per doctor (token), falling back to IP if there's no token.
  linkByDoctor: make({
    windowMs: HOUR,
    max: 30,
    message: 'Too many patient lookups. Please wait a while before trying again.',
    keyGenerator: (req) => {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      try {
        // Verified (not just decoded) so a forged token can't mint a fresh
        // bucket per request. Read lazily: dotenv hasn't run yet when this
        // module is first imported.
        const payload = token
          ? jwt.verify(token, process.env.JWT_SECRET || 'swastha_dev_secret_key_2026')
          : null;
        if (payload?.userId) return `doctor|${payload.userId}`;
      } catch {
        // invalid/expired token: fall through to the IP bucket
      }
      return `ip|${ipKeyGenerator(req.ip)}`;
    },
  }),

  // Backstop only — set high enough that shared clinic IPs never hit it.
  general: make({
    windowMs: 10 * MINUTE,
    max: generalMax,
    message: TOO_MANY,
    keyGenerator: byIp,
    skip: (req) => req.path === '/health' || req.path === '/api/health',
  }),
};
