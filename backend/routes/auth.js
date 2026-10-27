import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import multer from 'multer';

import fs from 'fs';

import { sendOTPEmail, sendPasswordResetEmail, sendAccountExistsEmail } from '../utils/mailer.js';
import {
  findUserByEmail,
  findUserById,
  findUserByIdOrPatientCode,
  createOrUpdateUser,
  updateUserPassword,
  deleteUserById,
} from '../db/users.js';
import { getFamilyVaultForUser, deleteFamilyVaultForUser } from '../db/family.js';
import { deleteAllReportsForUser } from '../db/reports.js';
import { processMedicalCertificate } from '../services/certificateParserService.js';
import { sniffFileType } from '../config/supabaseStorage.js';
import { publicUser } from '../utils/publicUser.js';
import { passwordPolicyError } from '../utils/passwordPolicy.js';
import { eraseAccountResidue } from '../db/accountErasure.js';
import { checkNoticeAck } from '../db/aiNoticeAcknowledgements.js';
import { verifyAuthToken, signAuthToken, sessionTokenTtl, rememberMeTokenTtl } from '../config/jwt.js';
import { wholeYears } from '../utils/age.js';
import { isFutureDate } from '../utils/dates.js';
import { isValidEmailFormat } from '../utils/emailFormat.js';

const router = express.Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '771272691038-s9h707grr3b4ojkgp48aa5vb9tej2sjh.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

if (!global.__otpStoreRaw) {
  global.__otpStoreRaw = new Map();
}
if (!global.__resetTokenStore) {
  global.__resetTokenStore = new Map();
}
if (!global.__passwordChangeTokenStore) {
  global.__passwordChangeTokenStore = new Map();
}

// otpStoreRaw: email/key => [{ code, expiresAt }, ...] — a LIST, not a
// single entry. Fixes a real bug: two logins to the SAME email close
// together (e.g. two people/devices logging into one shared doctor
// account) used to silently overwrite each other's OTP via a plain
// `.set(email, {code, expiresAt})`. Whoever's OTP landed second in the
// Map invalidated the first person's in-flight code, so their
// verify-otp call failed unpredictably depending on request timing —
// not a security issue (both still need the real code from their own
// inbox), but a confusing race. Keeping a small array of active codes
// per key means concurrent logins to the same email each get their own
// still-valid entry; verifying one only removes that one.
//
// otpStore below is a thin get/set/delete wrapper matching the Map API
// every existing call site already uses (`.get(key)`, `.set(key, val)`,
// `.delete(key)`) — no call site elsewhere in this file needed to change.
const otpStoreRaw = global.__otpStoreRaw;
const MAX_ACTIVE_CODES_PER_KEY = 5; // hard cap so a burst of requests can't grow this unbounded

const otpStore = {
  // Returns the most recently issued still-unexpired entry for `key`, or
  // undefined. Existing callers only ever compare against ONE stored code,
  // so `.get` needs to hand back a single {code, expiresAt} — it picks the
  // newest match for `otpCode` at verify time via a dedicated check instead
  // (see `verify` below); plain `.get` stays for the few read-only touches
  // (none currently), kept for API compatibility.
  get(key) {
    const list = otpStoreRaw.get(key);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1];
  },
  // Appends a new code rather than replacing the whole entry, so a
  // concurrent login for the same key doesn't clobber an unverified one.
  set(key, value) {
    const list = otpStoreRaw.get(key) || [];
    list.push(value);
    if (list.length > MAX_ACTIVE_CODES_PER_KEY) list.splice(0, list.length - MAX_ACTIVE_CODES_PER_KEY);
    otpStoreRaw.set(key, list);
  },
  // Removes every active code for `key`. Kept for callers that genuinely
  // want to invalidate the whole key (none currently — see deleteCode
  // below for the send-failure cleanup, which must only remove the ONE
  // code that failed to send, not a concurrent login's still-good one).
  delete(key) {
    otpStoreRaw.delete(key);
  },
  // Removes exactly one code for `key` — used when sendOTPEmail throws
  // right after issuing a code, so only that failed attempt's entry is
  // cleared. Using the broad `.delete(key)` here would also wipe out a
  // concurrent login's already-sent, still-valid code for the same email.
  deleteCode(key, code) {
    const list = otpStoreRaw.get(key);
    if (!list) return;
    const next = list.filter((e) => e.code !== code);
    if (next.length === 0) otpStoreRaw.delete(key);
    else otpStoreRaw.set(key, next);
  },
  // Checks `submittedCode` against ANY still-unexpired entry for `key`
  // (not just the most recent), and removes only that one entry —
  // verifying one concurrent login's code no longer invalidates another
  // still-pending login for the same email.
  verify(key, submittedCode) {
    const list = otpStoreRaw.get(key);
    if (!list || list.length === 0) return false;
    const now = Date.now();
    const idx = list.findIndex((e) => e.code === submittedCode && e.expiresAt > now);
    if (idx === -1) return false;
    list.splice(idx, 1);
    if (list.length === 0) otpStoreRaw.delete(key);
    else otpStoreRaw.set(key, list);
    return true;
  },
};

// --- OTP challenge state (per key) ----------------------------------------
// A "challenge" starts when a code is issued by something that has already
// proven part of the login: a correct password (/login), a Google sign-in
// (/google/exchange), a new registration (/register), or a logged-in user
// (/change-password/send-otp). It tracks resend and wrong-attempt budgets.
//
// /send-otp can then only RESEND inside an existing challenge. Before this it
// issued a code for any email with no prior step, so the password (or Google)
// step could be skipped: ask for a code, then guess it.
if (!global.__otpMeta) {
  global.__otpMeta = new Map();
}
const otpMeta = global.__otpMeta; // key => { startedAt, lastIssuedAt, resends, failed, locked }

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_CHALLENGE_WINDOW_MS = 30 * 60 * 1000; // how long after start a resend is still allowed
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_RESENDS = 5;
const OTP_MAX_WRONG_ATTEMPTS = 5;

// Issue a code. `fresh` starts a new challenge (resetting the budgets);
// otherwise it counts as a resend within the current one.
function issueOtp(key, { fresh }) {
  const now = Date.now();
  const code = crypto.randomInt(100000, 1000000).toString();
  otpStore.set(key, { code, expiresAt: now + OTP_TTL_MS });
  if (fresh) {
    otpMeta.set(key, { startedAt: now, lastIssuedAt: now, resends: 0, failed: 0, locked: false });
  } else {
    const meta = otpMeta.get(key);
    if (meta) {
      meta.resends += 1;
      meta.lastIssuedAt = now;
    }
  }
  return code;
}

function canResendOtp(key) {
  const meta = otpMeta.get(key);
  if (!meta || meta.locked) return false;
  const now = Date.now();
  if (now - meta.startedAt > OTP_CHALLENGE_WINDOW_MS) return false;
  if (meta.resends >= OTP_MAX_RESENDS) return false;
  if (now - meta.lastIssuedAt < OTP_RESEND_COOLDOWN_MS) return false;
  return true;
}

// Checks a submitted code and enforces the wrong-attempt budget. After
// OTP_MAX_WRONG_ATTEMPTS misses every outstanding code for the key is thrown
// away and the challenge is locked: the only way to get a new code is to go
// through the password / Google step again, so there's nothing for a guesser
// to keep trying, and a real user is never locked out by someone else.
function verifyOtp(key, submittedCode) {
  const meta = otpMeta.get(key);
  if (!meta || meta.locked) return { ok: false, reason: 'invalid' };

  if (otpStore.verify(key, submittedCode)) {
    otpMeta.delete(key);
    return { ok: true };
  }

  meta.failed += 1;
  if (meta.failed >= OTP_MAX_WRONG_ATTEMPTS) {
    meta.locked = true;
    otpStore.delete(key);
    return { ok: false, reason: 'locked' };
  }
  return { ok: false, reason: 'invalid' };
}

const OTP_LOCKED_MESSAGE = 'Too many incorrect codes. Please start again to get a new verification code.';

const resetTokenStore = global.__resetTokenStore; // token => { email, expiresAt }
const passwordChangeTokenStore = global.__passwordChangeTokenStore; // token => { email, expiresAt }

// Periodic cleanup to prevent memory leaks from expired OTPs & Reset Tokens
if (!global.__storeCleanupInterval) {
  global.__storeCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, list] of otpStoreRaw.entries()) {
      const fresh = list.filter((e) => e.expiresAt >= now);
      if (fresh.length === 0) otpStoreRaw.delete(key);
      else if (fresh.length !== list.length) otpStoreRaw.set(key, fresh);
    }
    for (const [key, meta] of otpMeta.entries()) {
      if (now - meta.startedAt > OTP_CHALLENGE_WINDOW_MS) otpMeta.delete(key);
    }
    for (const [key, data] of resetTokenStore.entries()) {
      if (data.expiresAt < now) resetTokenStore.delete(key);
    }
    for (const [key, data] of passwordChangeTokenStore.entries()) {
      if (data.expiresAt < now) passwordChangeTokenStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

// Multer Storage Setup for uploaded documents (Certificates, ID Proofs).
// Files are written to a local directory that is NOT served over HTTP (they
// used to be exposed at /uploads/<name> with no authentication): the doctor
// certificates and ID proofs in here are identity documents. The stored
// name is random and its extension comes from the file's real type, never
// from the client's filename.
const UPLOAD_DIR = 'uploads/';
const UPLOAD_EXTENSIONS = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = UPLOAD_EXTENSIONS[file.mimetype] || '';
    cb(null, `file-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
  fileFilter: (req, file, cb) => {
    if (UPLOAD_EXTENSIONS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and WEBP files are allowed.'));
    }
  },
});

// The declared Content-Type is client-controlled, so the file's first bytes
// must also match an allowed type, otherwise it is deleted again.
function fileMatchesAllowedType(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    return Boolean(sniffFileType(head));
  } catch {
    return false;
  }
}

// Middleware to authenticate JWT bearer tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = verifyAuthToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
};

/**
 * POST /api/auth/upload
 * Document Upload Handler (Medical Registration Certificate & Identity Proof)
 */
router.post('/upload', authenticateToken, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    if (!fileMatchesAllowedType(req.file.path)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'The uploaded file is not a valid PDF, JPEG, PNG or WEBP document.' });
    }
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:5001';
    const fullFileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    const relativeUrl = `/uploads/${req.file.filename}`;
    return res.json({
      message: 'File uploaded successfully',
      url: fullFileUrl,
      relativeUrl: relativeUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
    });
  });
});

/**
 * Verifies a Google-issued ID token (the id_token from the server-side code
 * exchange) against our client ID and returns the profile. This used to also
 * accept unverified tokens: it fell back to jwt.decode (which checks no
 * signature) and to access tokens looked up at several userinfo endpoints.
 * The only caller passes the id_token Google just returned over TLS, so
 * those branches could only ever have weakened it.
 */
async function decodeGoogleCredential(credential) {
  if (!credential || typeof credential !== 'string') {
    throw new Error('Google credential is required and must be a valid token');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error('Could not extract valid email from Google credentials');
  }
  // An address Google hasn't verified must not be trusted as an identity.
  if (payload.email_verified === false) {
    throw new Error('The Google account email is not verified');
  }

  return { email: payload.email, name: payload.name, picture: payload.picture, sub: payload.sub };
}

/**
 * POST /api/auth/login
 * Email & Password Login -> Sends 6-digit OTP code to email
 */
// A real bcrypt hash of a throwaway string, compared against when the account
// doesn't exist (or has no password) so that case takes as long as a wrong
// password and the response time doesn't reveal which addresses are registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('swastha-dummy-password-for-timing', 12);

// Every login failure says the same thing: which part was wrong (no such
// account, Google-only account, bad password) is not disclosed.
const LOGIN_FAILED_MESSAGE =
  'Incorrect email or password. If you signed up with Google, use "Continue with Google".';

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await findUserByEmail(normalizedEmail);

  const passwordOk = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !user.password_hash || !passwordOk) {
    return res.status(401).json({ message: LOGIN_FAILED_MESSAGE });
  }

  try {
    await issueAndSendOtp(normalizedEmail);
    return res.json({
      requiresOTP: true,
      email: normalizedEmail,
      message: 'Verification code sent to your email.',
    });
  } catch (error) {
    console.error('Failed to send verification email.', error?.message || error);
    return res.status(500).json({
      message: 'Failed to send verification email.',
    });
  }
});

// Validation helpers for email & phone correctness
function isValidEmail(email) {
  return isValidEmailFormat(email);
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
  // Indian mobile numbers: exactly 10 digits, starting with 6-9
  if (!/^[6-9]\d{9}$/.test(cleaned)) return false;
  if (/^(\d)\1{9}$/.test(cleaned)) return false; // Rejects 6666666666, 9999999999, etc.
  return true;
}

function isValidFullName(name) {
  if (!name || typeof name !== 'string') return false;
  return /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(name.trim());
}

function isValidRegistrationNumber(value) {
  if (!value || typeof value !== 'string') return false;
  return /^(?=.*\d)[A-Za-z0-9/\-\s]{4,30}$/.test(value.trim());
}

function isValidWordsField(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[A-Za-z][A-Za-z .,&-]{1,59}$/.test(value.trim());
}

function isValidFreeTextField(value, { minLength = 3, maxLength = 300 } = {}) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) return false;
  return /[A-Za-z]/.test(trimmed);
}

function isValidPastDate(dateStr, { minAge = 0, maxAge = 120 } = {}) {
  if (!dateStr) return false;
  const dob = new Date(dateStr);
  if (Number.isNaN(dob.getTime())) return false;

  if (isFutureDate(dateStr)) return false;

  // A date that is still "today" somewhere (see utils/dates.js) can be a day ahead of the server clock.
  const age = Math.max(0, wholeYears(dob, new Date()));
  return age >= minAge && age <= maxAge;
}

// Issues a verification code for `key` and emails it to `email`. If the email cannot be
// sent, only that code is discarded (not a concurrent login's valid one) and the error is
// rethrown for the caller to turn into a response.
async function issueAndSendOtp(email, { key = email, fresh = true } = {}) {
  const otpCode = issueOtp(key, { fresh });
  try {
    await sendOTPEmail(email, otpCode);
  } catch (error) {
    otpStore.deleteCode(key, otpCode);
    throw error;
  }
}

// Identical for a brand-new address and one that already has an account.
const REGISTER_REPLY = 'Check your email to continue. If you already have an account, the email tells you how to log in.';

/**
 * POST /api/auth/register
 * Email & Password Registration -> Creates account, sends 6-digit OTP
 */
router.post('/register', async (req, res) => {
  // The account type is NOT taken from the request. A new account has no role; the person picks patient
  // or doctor afterwards, and the doctor details (including the certificate) are checked then.
  // Taking it from the body let anyone register straight as a doctor and skip all of that.
  const { fullName, email, password, phone } = req.body;
  if (!fullName || !email || !password || !phone) {
    return res.status(400).json({ message: 'Full Name, Email, Phone Number, and Password are all required.' });
  }

  if (!isValidFullName(fullName)) {
    return res.status(400).json({ message: 'Please enter your full name using letters only (2-60 characters).' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address (e.g., name@example.com).' });
  }

  if (!isValidPhone(phone)) {
    return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
  }

  const passwordProblem = passwordPolicyError(password);
  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    // Answered exactly like a new registration, so this form can't be used to
    // find out who has an account. The real owner is told by email instead.
    // (The new-account path hashes the password, so this one does too — to
    // keep the response time from giving it away.)
    await bcrypt.hash(password, 12);
    try {
      await sendAccountExistsEmail(normalizedEmail);
    } catch (mailError) {
      console.error('Account-exists email failed:', mailError?.message || mailError);
    }
    return res.status(201).json({ requiresOTP: true, email: normalizedEmail, message: REGISTER_REPLY });
  }

  const user = await createOrUpdateUser({
    name: fullName || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    password,
    role: 'none',
    authProvider: 'email',
  });

  try {
    await issueAndSendOtp(normalizedEmail);
    return res.status(201).json({
      requiresOTP: true,
      email: normalizedEmail,
      message: REGISTER_REPLY,
    });
  } catch (error) {
    console.error('Account created, but the verification email could not be sent.', error?.message || error);
    return res.status(500).json({
      message: 'Account created, but the verification email could not be sent.',
    });
  }
});

/**
 * Shared completion logic for any Google sign-in path: find-or-create the user, then
 * send the 6-digit OTP the same way password-based login does. Used by the
 * redirect-based google/exchange route.
 */
async function completeGoogleAuth(res, { email, name, picture, sub }, { role } = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await findUserByEmail(normalizedEmail);

  if (!existingUser) {
    await createOrUpdateUser({
      id: 'usr_g_' + (sub || Date.now()),
      email: normalizedEmail,
      name: name || normalizedEmail.split('@')[0],
      picture: picture || null,
      // Never taken from the request (see /register): a new account has no role yet.
      role: null,
      hasSelectedRole: false,
      authProvider: 'google',
    });
  }

  try {
    await issueAndSendOtp(normalizedEmail);
    return res.json({
      requiresOTP: true,
      email: normalizedEmail,
      message: 'Verification code sent to your Google email address.',
    });
  } catch (error) {
    console.error('Could not send the verification email to your Google address.', error?.message || error);
    return res.status(500).json({
      message: 'Could not send the verification email to your Google address.',
    });
  }
}

/**
 * POST /api/auth/google/exchange
 * Redirect-flow completion: exchanges an OAuth authorization code for tokens server-to-server
 * (needs GOOGLE_CLIENT_SECRET), then runs the same completeGoogleAuth flow as above. This is
 * what lets "Continue with Google" work as a full-page redirect instead of a popup, so ad
 * blockers that block window.open()/popups can't break it.
 */
router.post('/google/exchange', async (req, res) => {
  const { code, redirectUri, mode = 'login', role } = req.body;

  if (!code || !redirectUri) {
    return res.status(400).json({ message: 'Authorization code and redirect URI are required.' });
  }

  if (!GOOGLE_CLIENT_SECRET) {
    console.error('GOOGLE_CLIENT_SECRET is not configured; cannot complete Google code exchange.');
    return res.status(500).json({ message: 'Google sign-in is not configured on the server yet.' });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id_token) {
      console.error('Google token exchange failed:', tokenData?.error || tokenResponse.status);
      return res.status(401).json({ message: 'Google sign-in could not be completed. Please try again.' });
    }

    const profile = await decodeGoogleCredential(tokenData.id_token);
    if (!profile.email) {
      return res.status(400).json({ message: 'Could not extract valid email from Google credentials' });
    }

    return await completeGoogleAuth(res, profile, { role: mode === 'register' ? role : undefined });
  } catch (error) {
    console.error('Google code exchange error:', error);
    return res.status(401).json({ message: 'Google sign-in could not be completed.' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verifies 6-digit OTP and logs user in
 */
router.post('/verify-otp', async (req, res) => {
  const { email, otpCode } = req.body || {};
  if (typeof otpCode !== 'string' || !/^\d{6}$/.test(otpCode)) {
    return res.status(400).json({ message: 'A valid 6-digit verification code is required.' });
  }
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  const key = email.toLowerCase().trim();
  // ':' is reserved for internal keys such as "changepwd:<email>" — a real
  // address never contains it, and the public endpoint must not be able to
  // reach those.
  if (key.includes(':')) {
    return res.status(400).json({ message: 'Invalid or expired verification code.' });
  }

  // Checks ANY still-active code for this email (not just the newest), so a
  // second concurrent login to the same email doesn't invalidate the first —
  // and enforces the wrong-attempt budget.
  const result = verifyOtp(key, otpCode);
  if (!result.ok) {
    if (result.reason === 'locked') {
      return res.status(429).json({ message: OTP_LOCKED_MESSAGE });
    }
    return res.status(400).json({ message: 'Invalid or expired verification code.' });
  }

  let user = await findUserByEmail(key);

  if (!user) {
    // New user - createOrUpdateUser will generate patient code if needed
    user = await createOrUpdateUser({
      email: key,
      name: key.split('@')[0],
      role: 'none',
      authProvider: 'email',
    });
  } else {
    // Existing user - ensure patient code is generated if missing
    // createOrUpdateUser will now handle this automatically
    user = await createOrUpdateUser({
      ...user,
      email: key,
    });
  }

  // Only used to put the vault id in the session. A failed lookup must not stop a login that
  // otherwise succeeded, so it counts as "no vault id" here; the vault pages report real errors.
  let vault = null;
  try {
    vault = await getFamilyVaultForUser(user.id);
  } catch {
    vault = null;
  }
  // "Remember me" (ticked on the login screen) gets the longer session; every
  // other sign-in, including register and Google, gets the normal one.
  const token = signAuthToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    vaultId: vault?.vaultId || null,
    expiresIn: req.body?.rememberMe === true ? rememberMeTokenTtl() : sessionTokenTtl(),
  });

  const response = {
    message: 'Verification successful',
    token,
    vaultId: vault?.vaultId || null,
    user: {
      ...publicUser(user),
      vaultId: vault?.vaultId || null,
      hasSelectedRole: !!(user.role && user.role !== 'none'),
    },
  };


  return res.json(response);
});

// Fields a client must never be able to set through the profile form: they
// either identify/authenticate the account or record a server-side decision.
const PROFILE_FORBIDDEN_FIELDS = [
  'id', 'userId', 'email', 'password', 'password_hash', 'passwordHash',
  'patient_code', 'patientCode', 'auth_provider', 'authProvider',
  'verification_status', 'verificationStatus',
  'cert_extracted_data', 'certExtractedData',
  'license_expiry_date', 'licenseExpiryDate',
  'created_at', 'updated_at',
];

/**
 * POST /api/auth/profile
 * Updates user profile details (Patient or Doctor registration forms)
 */
router.post('/profile', authenticateToken, async (req, res) => {
  const { role, ...rawProfileDetails } = req.body || {};
  const profileDetails = { ...rawProfileDetails };
  for (const field of PROFILE_FORBIDDEN_FIELDS) {
    delete profileDetails[field];
  }

  // The account being edited is ALWAYS the one the token belongs to — never
  // an id/email taken from the body, which would let any logged-in user
  // overwrite (or take over) someone else's profile.
  const userToUpdate = (req.user.userId && await findUserById(req.user.userId))
    || (req.user.email && await findUserByEmail(req.user.email))
    || null;
  if (!userToUpdate) {
    return res.status(401).json({ message: 'This account no longer exists. Please log in again.' });
  }

  const targetEmail = userToUpdate.email;
  // The account's type comes from the DATABASE, not from the request. It used to come from the body
  // (and the "this is only an update" flag too), so leaving them out or lying about them skipped
  // every check below and let a pending account become a patient with any details.
  const assignedRole = userToUpdate.role === 'patient' || userToUpdate.role === 'doctor' ? userToUpdate.role : null;
  const requestedRole = role || profileDetails.role;
  if (requestedRole !== undefined && requestedRole !== 'patient' && requestedRole !== 'doctor') {
    return res.status(400).json({ message: 'Role must be either patient or doctor.' });
  }
  if (assignedRole && requestedRole && requestedRole !== assignedRole) {
    return res.status(400).json({ message: 'The account type cannot be changed once it is set.' });
  }
  const targetRole = assignedRole || requestedRole;
  if (!targetRole) {
    return res.status(400).json({ message: 'Please choose whether this is a patient or a doctor account.' });
  }

  // First-time setup (the account has no type yet) needs every detail; after that this is an edit of an
  // existing profile, and whatever is sent is still checked.
  const isFirstTimeSetup = !assignedRole;
  const isSettingsUpdate = !isFirstTimeSetup;
  const isRoleSwitch = isFirstTimeSetup;

  // Patient Mandatory Fields Validation (for registration OR first-time role selection to patient)
  if (targetRole === 'patient' && (!isSettingsUpdate || isRoleSwitch)) {
    const { fullName, dob, bloodGroup, phone, gender } = profileDetails;
    const nameVal = fullName || profileDetails.name;
    const phoneVal = phone || profileDetails.mobile;
    const genderVal = gender || profileDetails.gender;
    if (!nameVal || !dob || !bloodGroup || !phoneVal || !genderVal) {
      return res.status(400).json({
        message: 'All patient details (Full Name, Date of Birth, Gender, Blood Group, and Mobile Phone Number) are mandatory when setting up a Patient account.',
      });
    }
    if (nameVal && !isValidFullName(nameVal)) {
      return res.status(400).json({ message: 'Please enter a valid full name using letters only.' });
    }
    if (phoneVal && !isValidPhone(phoneVal)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
    }
    if (dob && !isValidPastDate(dob)) {
      return res.status(400).json({ message: 'Please enter a valid date of birth.' });
    }
  }

  // An edit of an existing patient profile: no field is mandatory, but whatever is sent must be valid.
  if (targetRole === 'patient' && isSettingsUpdate) {
    const nameVal = profileDetails.fullName || profileDetails.name;
    const phoneVal = profileDetails.phone || profileDetails.mobile;
    const dobVal = profileDetails.dob || profileDetails.dateOfBirth || profileDetails.date_of_birth;
    if (nameVal && !isValidFullName(nameVal)) {
      return res.status(400).json({ message: 'Please enter a valid full name using letters only.' });
    }
    if (phoneVal && !isValidPhone(phoneVal)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
    }
    if (dobVal && !isValidPastDate(dobVal)) {
      return res.status(400).json({ message: 'Please enter a valid date of birth.' });
    }
  }

  // Doctor Mandatory Fields & Certificate Extraction Pipeline (for registration OR role switch to doctor)
  let extractedCertMeta = {};
  if (targetRole === 'doctor') {
    const { fullName, phone, mobile, dob, regNumber, licenseNumber, council, degree, specialization, specialty, hospitalName, address } = profileDetails;
    const certUrl = profileDetails.regCertificateUrl || profileDetails.reg_certificate_url || profileDetails.certificateUrl || profileDetails.certificate_url;
    const nameVal = fullName || profileDetails.name;
    const phoneVal = phone || mobile;
    const licVal = regNumber || licenseNumber;
    const specVal = specialization || specialty;

    const isNewCertProvided = Boolean(certUrl && certUrl !== userToUpdate?.reg_certificate_url);

    // An edit that comes with no new certificate used to skip every check. Whatever is sent is still
    // validated, and the registration itself (number or council) cannot be changed without
    // uploading the certificate that backs the new one.
    if (isSettingsUpdate && !isNewCertProvided) {
      if (nameVal && !isValidFullName(nameVal)) {
        return res.status(400).json({ message: 'Please enter a valid full name using letters only.' });
      }
      if (phoneVal && !isValidPhone(phoneVal)) {
        return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
      }
      if (dob && !isValidPastDate(dob, { minAge: 21, maxAge: 100 })) {
        return res.status(400).json({ message: 'Please enter a valid date of birth (doctors must be at least 21 years old).' });
      }
      if (licVal && !isValidRegistrationNumber(licVal)) {
        return res.status(400).json({ message: 'Please enter a valid Medical Registration Number (must include at least one digit).' });
      }
      if (degree && !isValidWordsField(degree)) {
        return res.status(400).json({ message: 'Please enter a valid Primary Degree.' });
      }
      if (specVal && !isValidWordsField(specVal)) {
        return res.status(400).json({ message: 'Please enter a valid Specialization.' });
      }
      if (hospitalName && !isValidFreeTextField(hospitalName, { minLength: 3, maxLength: 150 })) {
        return res.status(400).json({ message: 'Please enter a valid Hospital or Clinic Name.' });
      }
      if (address && !isValidFreeTextField(address, { minLength: 8, maxLength: 300 })) {
        return res.status(400).json({ message: 'Please enter a valid, complete practice address.' });
      }
      const registrationChanged =
        (licVal && licVal !== userToUpdate.license_number) || (council && council !== userToUpdate.council);
      if (registrationChanged) {
        return res.status(400).json({
          message: 'To change your registration number or council, upload the Medical Registration Certificate that backs it.',
        });
      }
    }

    if (!isSettingsUpdate || isRoleSwitch || isNewCertProvided) {
      if (!nameVal || !phoneVal || !dob || !licVal || !council || !degree || !specVal || !hospitalName || !address || !certUrl) {
        return res.status(400).json({
          message: 'All doctor credentials (Full Name, Date of Birth, Mobile Number, Medical Registration #, Council, Degree, Specialization, Hospital/Clinic Name, Practice Address, and Medical Registration Certificate) are mandatory when setting up a Doctor account.',
        });
      }
      if (nameVal && !isValidFullName(nameVal)) {
        return res.status(400).json({ message: 'Please enter a valid full name using letters only.' });
      }
      if (phoneVal && !isValidPhone(phoneVal)) {
        return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
      }
      if (dob && !isValidPastDate(dob, { minAge: 21, maxAge: 100 })) {
        return res.status(400).json({ message: 'Please enter a valid date of birth (doctors must be at least 21 years old).' });
      }
      if (licVal && !isValidRegistrationNumber(licVal)) {
        return res.status(400).json({ message: 'Please enter a valid Medical Registration Number (must include at least one digit).' });
      }
      if (degree && !isValidWordsField(degree)) {
        return res.status(400).json({ message: 'Please enter a valid Primary Degree.' });
      }
      if (specVal && !isValidWordsField(specVal)) {
        return res.status(400).json({ message: 'Please enter a valid Specialization.' });
      }
      if (hospitalName && !isValidFreeTextField(hospitalName, { minLength: 3, maxLength: 150 })) {
        return res.status(400).json({ message: 'Please enter a valid Hospital or Clinic Name.' });
      }
      if (address && !isValidFreeTextField(address, { minLength: 8, maxLength: 300 })) {
        return res.status(400).json({ message: 'Please enter a valid, complete practice address.' });
      }

      // The certificate is sent to an AI provider to be read, so the doctor must
      // have accepted how Swastha uses AI first (the notice covers uploaded
      // documents). The frontend shows it when it sees this 403 and the doctor
      // submits again.
      const certConsent = await checkNoticeAck(userToUpdate.id, 'ask_swastha');
      if (!certConsent.ok) {
        if (certConsent.status === 403) {
          return res.status(403).json({
            message: 'Please review how Swastha uses AI before we scan your certificate.',
            code: certConsent.code,
            feature: certConsent.feature,
            notice_version: certConsent.noticeVersion,
          });
        }
        return res.status(500).json({ message: 'Could not verify notice acknowledgement. Please try again.' });
      }

      // Process & Extract Medical Data from Uploaded Certificate via Gemini Vision AI
      const certAnalysis = await processMedicalCertificate(certUrl, {
        fullName: nameVal,
        regNumber: licVal,
        council,
        degree,
        specialization: specVal,
      });

      if (certAnalysis.isMedicalCertificate === false) {
        return res.status(400).json({
          message: certAnalysis.validationError || 'Uploaded file is not a valid Medical Registration Certificate. Please upload your official medical council certificate.',
        });
      }

      extractedCertMeta = {
        certExtractedData: certAnalysis.extractedData || null,
        licenseExpiryDate: certAnalysis.extractedData?.expiryDate || null,
        verificationStatus: certAnalysis.success ? 'verified' : 'pending',
      };
    }
  }

  try {
    const emailToUse = userToUpdate?.email || targetEmail || profileDetails.email;
    if (!emailToUse) {
      return res.status(400).json({ message: 'User email or ID is required to save profile details.' });
    }

    const isDoctor = (targetRole || userToUpdate?.role) === 'doctor';
    const savedUser = await createOrUpdateUser({
      ...userToUpdate,
      ...profileDetails,
      ...extractedCertMeta,
      email: emailToUse,
      name: profileDetails.name || profileDetails.fullName || userToUpdate?.name,
      fullName: profileDetails.name || profileDetails.fullName || userToUpdate?.fullName,
      phone: profileDetails.phone || profileDetails.mobile || userToUpdate?.phone,
      mobile: profileDetails.phone || profileDetails.mobile || userToUpdate?.mobile,
      dob: profileDetails.dob || profileDetails.dateOfBirth || profileDetails.date_of_birth || userToUpdate?.dob,
      bloodGroup: profileDetails.bloodGroup || profileDetails.blood_group || userToUpdate?.bloodGroup,
      blood_group: profileDetails.bloodGroup || profileDetails.blood_group || userToUpdate?.blood_group,
      gender: profileDetails.gender || userToUpdate?.gender,
      emergencyContact: profileDetails.emergencyContact || profileDetails.emergency_contact || userToUpdate?.emergencyContact,
      address: isDoctor ? (profileDetails.address || profileDetails.hospital_address || userToUpdate?.address) : null,
      hospitalName: isDoctor ? (profileDetails.hospitalName || profileDetails.hospital_name || userToUpdate?.hospitalName) : null,
      hospital_name: isDoctor ? (profileDetails.hospitalName || profileDetails.hospital_name || userToUpdate?.hospital_name) : null,
      specialty: isDoctor ? (profileDetails.specialization || profileDetails.specialty || userToUpdate?.specialty) : null,
      specialization: isDoctor ? (profileDetails.specialization || profileDetails.specialty || userToUpdate?.specialization) : null,
      licenseNumber: isDoctor ? (profileDetails.regNumber || profileDetails.licenseNumber || userToUpdate?.licenseNumber) : null,
      license_number: isDoctor ? (profileDetails.regNumber || profileDetails.licenseNumber || userToUpdate?.license_number) : null,
      regNumber: isDoctor ? (profileDetails.regNumber || profileDetails.licenseNumber || userToUpdate?.regNumber) : null,
      council: isDoctor ? (profileDetails.council || userToUpdate?.council) : null,
      degree: isDoctor ? (profileDetails.degree || userToUpdate?.degree) : null,
      experience: isDoctor ? (profileDetails.experience !== undefined ? profileDetails.experience : userToUpdate?.experience) : null,
      regCertificateUrl: isDoctor ? (profileDetails.regCertificateUrl || profileDetails.reg_certificate_url || userToUpdate?.reg_certificate_url) : null,
      certExtractedData: isDoctor ? (extractedCertMeta.certExtractedData || userToUpdate?.cert_extracted_data) : null,
      licenseExpiryDate: isDoctor ? (extractedCertMeta.licenseExpiryDate || userToUpdate?.license_expiry_date) : null,
      verificationStatus: isDoctor ? (extractedCertMeta.verificationStatus || userToUpdate?.verification_status || 'pending') : 'verified',
      role: targetRole || userToUpdate?.role || 'patient',
      hasSelectedRole: true,
    });

    // The session token carries the role, and it was minted before role
    // selection (role 'none'). Hand back a fresh one when the role changed, so
    // checks that read the token's role work in this session instead of only
    // after the next login.
    const refreshedToken = savedUser.role && savedUser.role !== req.user.role
      ? signAuthToken({
          userId: savedUser.id,
          email: savedUser.email,
          role: savedUser.role,
          vaultId: req.user.vaultId || null,
          // Keep the time the session had left, instead of starting a fresh one.
          expiresIn: Math.max(60, (req.user.exp || 0) - Math.floor(Date.now() / 1000)),
        })
      : undefined;

    return res.json({
      message: 'User profile updated successfully',
      extractedCertificateData: extractedCertMeta.certExtractedData || null,
      user: publicUser(savedUser),
      ...(refreshedToken ? { token: refreshedToken } : {}),
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ message: 'Failed to update profile' });
  }
});

/**
 * POST /api/auth/send-otp
 * RESEND only. A code can only be re-sent inside a verification that has
 * already been started by /login, /register or Google sign-in — never issued
 * cold for an arbitrary address (see the OTP challenge helpers above). The
 * reply is identical whether or not anything was sent, so this can't be used
 * to find out which addresses have accounts or sign-ins in progress.
 */
router.post('/send-otp', async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const genericReply = { message: 'If a sign-in is in progress for this email, a new verification code has been sent.' };

  if (normalizedEmail.includes(':') || !canResendOtp(normalizedEmail)) {
    return res.json(genericReply);
  }

  try {
    await issueAndSendOtp(normalizedEmail, { fresh: false });
  } catch (error) {
    console.error('Resend OTP email failed:', error?.message || error);
    return res.status(500).json({ message: 'Failed to send verification code.' });
  }
  return res.json(genericReply);
});

/**
 * DELETE /api/auth/user
 * Deletes the authenticated user and their family vault data.
 */
router.delete('/user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return res.status(401).json({ message: 'Authentication required to delete account.' });
    }

    let decoded;
    try {
      decoded = verifyAuthToken(token);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }

    const userId = decoded.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID missing from token.' });
    }

    // Read before the row is gone: a doctor's certificate file has to be removed too.
    const accountBeingDeleted = await findUserById(userId);

    // Delete child records first (defensive — works whether or not DB-level
    // ON DELETE CASCADE is configured on reports/vault_table/family_members).
    await deleteAllReportsForUser(userId);
    await deleteFamilyVaultForUser(userId);
    const deleted = await deleteUserById(userId);

    if (!deleted) {
      return res.status(500).json({ message: 'Failed to delete user account.' });
    }

    // What has no foreign key to the user (consent records,
    // feedback, the audit/provider logs' user ids, the certificate file): see
    // db/accountErasure.js. Failures are logged there and don't undo the
    // deletion the user asked for.
    await eraseAccountResidue(userId, { certificateUrl: accountBeingDeleted?.reg_certificate_url });

    return res.json({ message: 'Account and all associated records deleted successfully.' });
  } catch (error) {
    console.error('Delete user account error:', error);
    return res.status(500).json({ message: 'Failed to delete account' });
  }
});

/**
 * POST /api/auth/change-password/send-otp
 * Sends a 6-digit OTP to the authenticated user's own email to confirm
 * identity before allowing them to change their password from Settings.
 */
router.post('/change-password/send-otp', authenticateToken, async (req, res) => {
  try {
    const email = (req.user.email || '').toLowerCase().trim();
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }
    if (!user.password_hash) {
      return res.status(400).json({
        message: 'This account was registered using Google Sign-In and does not have a password to change.',
      });
    }

    try {
      await issueAndSendOtp(email, { key: `changepwd:${email}` });
      return res.json({ message: `Verification code sent to ${email}` });
    } catch (error) {
      console.error('Failed to send verification code to your email.', error?.message || error);
      return res.status(500).json({
        message: 'Failed to send verification code to your email.',
      });
    }
  } catch (error) {
    console.error('Change-password send-otp error:', error);
    return res.status(500).json({ message: 'Failed to send verification code' });
  }
});

/**
 * POST /api/auth/change-password/verify-otp
 * Verifies the OTP and issues a short-lived, single-use change token that
 * authorizes the following /change-password/confirm call.
 */
router.post('/change-password/verify-otp', authenticateToken, async (req, res) => {
  const { otpCode } = req.body || {};
  if (typeof otpCode !== 'string' || !/^\d{6}$/.test(otpCode)) {
    return res.status(400).json({ message: 'A valid 6-digit verification code is required.' });
  }

  const email = (req.user.email || '').toLowerCase().trim();
  const key = `changepwd:${email}`;
  const result = verifyOtp(key, otpCode);

  if (!result.ok) {
    if (result.reason === 'locked') {
      return res.status(429).json({ message: OTP_LOCKED_MESSAGE });
    }
    return res.status(400).json({ message: 'Invalid or expired verification code.' });
  }

  const changeToken = 'chg_' + crypto.randomBytes(24).toString('hex');
  passwordChangeTokenStore.set(changeToken, { email, expiresAt: Date.now() + 10 * 60 * 1000 });

  return res.json({ message: 'Verification successful', changeToken });
});

/**
 * POST /api/auth/change-password/confirm
 * Consumes the change token issued above and sets the new password.
 */
router.post('/change-password/confirm', authenticateToken, async (req, res) => {
  const { changeToken, newPassword } = req.body || {};
  const passwordProblem = passwordPolicyError(newPassword);
  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  const email = (req.user.email || '').toLowerCase().trim();
  const data = changeToken ? passwordChangeTokenStore.get(changeToken) : null;

  if (!data || data.email !== email) {
    return res.status(400).json({ message: 'This verification session is invalid. Please verify your code again.' });
  }
  if (data.expiresAt <= Date.now()) {
    passwordChangeTokenStore.delete(changeToken);
    return res.status(400).json({ message: 'This verification session has expired. Please verify your code again.' });
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser && existingUser.password_hash && (await bcrypt.compare(newPassword, existingUser.password_hash))) {
    return res.status(400).json({ message: 'This password is already being used. Please use a different password.' });
  }

  // Update first, then spend the one-time token: if the database write fails the
  // user gets an error and can try again with the same verification.
  try {
    await updateUserPassword(email, newPassword);
  } catch (updateError) {
    return res.status(500).json({ message: 'Could not update your password. Please try again.' });
  }
  passwordChangeTokenStore.delete(changeToken); // Single-use consumption!
  return res.json({ message: 'Password updated successfully.' });
});

/**
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ message: 'Email address is required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  // The reply never depends on whether the address has an account (or only a
  // Google login), so this can't be used to find out who is registered.
  const genericReply = { message: 'If an account exists for that email, we\'ve sent a password reset link to it.' };

  const existingUser = await findUserByEmail(normalizedEmail);
  // Google-only accounts have no password to reset.
  if (!existingUser || !existingUser.password_hash) {
    return res.json(genericReply);
  }

  // Clear any existing reset tokens for this email
  for (const [t, data] of resetTokenStore.entries()) {
    if (data.email.toLowerCase() === normalizedEmail) {
      resetTokenStore.delete(t);
    }
  }

  const resetToken = 'rst_' + crypto.randomBytes(24).toString('hex');
  resetTokenStore.set(resetToken, { email: normalizedEmail, expiresAt: Date.now() + 30 * 60 * 1000 });

  // Replied to before the email goes out: otherwise the extra time a real
  // send takes would itself reveal that the account exists.
  res.json(genericReply);
  try {
    await sendPasswordResetEmail(normalizedEmail, resetToken);
  } catch (error) {
    resetTokenStore.delete(resetToken);
    console.error('Password reset email failed:', error?.message || error);
  }
});

/**
 * GET /api/auth/verify-reset-token
 * Validates if password reset token is still valid (not used and not expired)
 */
router.get('/verify-reset-token', (req, res) => {
  const { token } = req.query;
  if (!token || !resetTokenStore.has(token)) {
    return res.status(400).json({ valid: false, message: 'This password reset link is invalid or has already been used.' });
  }
  const data = resetTokenStore.get(token);
  if (data.expiresAt <= Date.now()) {
    resetTokenStore.delete(token);
    return res.status(400).json({ valid: false, message: 'This password reset link has expired. Please request a new one.' });
  }
  return res.json({ valid: true, email: data.email });
});

/**
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  const { token, email, newPassword } = req.body || {};
  if (!newPassword) {
    return res.status(400).json({ message: 'New password is required' });
  }
  const passwordProblem = passwordPolicyError(newPassword);
  if (passwordProblem) {
    return res.status(400).json({ message: passwordProblem });
  }

  if (!token || !resetTokenStore.has(token)) {
    return res.status(400).json({ message: 'This password reset link is invalid or has already been used. Please request a new link.' });
  }

  const data = resetTokenStore.get(token);
  if (data.expiresAt <= Date.now()) {
    resetTokenStore.delete(token);
    return res.status(400).json({ message: 'This password reset link has expired. Please request a new link.' });
  }

  const targetEmail = data.email.toLowerCase().trim();

  // Check if new password is the same as previous password
  const existingUser = await findUserByEmail(targetEmail);
  if (existingUser && existingUser.password_hash && (await bcrypt.compare(newPassword, existingUser.password_hash))) {
    return res.status(400).json({ message: 'This password is already being used. Please use a different password.' });
  }

  // Reset first, then spend the one-time link: if the database write fails the user
  // gets an error and the same link still works for another try.
  try {
    await updateUserPassword(targetEmail, newPassword);
  } catch (updateError) {
    return res.status(500).json({ message: 'Could not reset your password. Please try again.' });
  }
  resetTokenStore.delete(token); // Single-use consumption!
  return res.json({ message: 'Password reset successfully. You can now login with your new password.' });
});

/**
 * GET /api/auth/users/:userId
 * Looks up the AUTHENTICATED CALLER's own record by their ID or
 * patient_code. Previously had no auth middleware at all and would return
 * any user's full record (name/dob/phone/gender/blood_group/address, and
 * pre-bcrypt, password_hash) to anyone who could guess an id/patient_code —
 * scoped here to the caller only. A mismatch returns the same 404 as "not
 * found" rather than 403, so the response can't be used to confirm whether
 * a given id/patient_code belongs to someone else.
 */
router.get('/users/:userId', authenticateToken, async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    // findUserByIdOrPatientCode checks id across patients/doctors/pending
    // first (matching the old findUserById), then falls back to patients'
    // patient_code (the only table that has that column post-split).
    const user = await findUserByIdOrPatientCode(userId);

    if (!user || user.id !== req.user.userId) {
      return res.status(404).json({ message: 'No user found with this ID.' });
    }

    return res.json({
      user: {
        ...publicUser(user),
        patientId: user.patient_code || user.id,
        fullName: user.name || user.fullName,
        mobile: user.phone || user.mobile,
        phone: user.phone || user.mobile,
        bloodGroup: user.blood_group || user.bloodGroup || user.blood_type,
        blood_group: user.blood_group || user.bloodGroup || user.blood_type,
        dob: user.dob || user.date_of_birth || user.dateOfBirth,
        licenseNumber: user.license_number || user.licenseNumber || user.regNumber,
        regNumber: user.license_number || user.licenseNumber || user.regNumber,
        specialization: user.specialty || user.specialization,
        specialty: user.specialty || user.specialization,
        hospitalName: user.hospital_name || user.hospitalName,
        hospital_name: user.hospital_name || user.hospitalName,
        hasSelectedRole: !!(user.role && user.role !== 'none'),
      },
    });
  } catch (error) {
    console.error('User lookup error:', error);
    return res.status(500).json({ message: 'Failed to fetch user details.' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAuthToken(token);
    const user = (await findUserById(decoded.userId)) || (await findUserByEmail(decoded.email));
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      user: {
        ...publicUser(user),
        fullName: user.name || user.fullName,
        mobile: user.phone || user.mobile,
        phone: user.phone || user.mobile,
        bloodGroup: user.blood_group || user.bloodGroup || user.blood_type,
        blood_group: user.blood_group || user.bloodGroup || user.blood_type,
        dob: user.dob || user.date_of_birth || user.dateOfBirth,
        licenseNumber: user.license_number || user.licenseNumber || user.regNumber,
        regNumber: user.license_number || user.licenseNumber || user.regNumber,
        specialization: user.specialty || user.specialization,
        specialty: user.specialty || user.specialization,
        hospitalName: user.hospital_name || user.hospitalName,
        hospital_name: user.hospital_name || user.hospitalName,
        hasSelectedRole: !!(user.role && user.role !== 'none'),
      },
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

export default router;