import express from 'express';
import jwt from 'jsonwebtoken';
import supabase from '../config/supabase.js';
import { resolveCheckinCode, getOrCreateTodayCode } from '../db/clinicCheckin.js';
import { findUserById } from '../db/users.js';
import { sendOTPEmail } from '../utils/mailer.js';
import { accessExpiryFromNow } from '../db/doctorPatients.js';
import { startIntakeSession } from '../rag/services/intakeService.js';
import { synthesizeSpeech } from '../rag/services/ttsService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

// Clinic check-in flow (PRD §3). Lives in backend/routes/, not backend/rag/
// routes/ — same reasoning as doctor-patients.js's intake-queue routes: this
// is plain DB lookups + reuse of existing OTP logic, not generation-class
// work. verify-otp creates the intake_sessions row directly via the same
// intakeService.startIntakeSession() call POST /api/intake/start already
// uses, rather than hopping across the /rag sub-app boundary with a second
// HTTP call — the frontend then drives the rest of the conversation through
// the existing, unchanged POST /api/intake/turn.

// otpStoreRaw/otpStore is defined in routes/auth.js as a global singleton
// (global.__otpStoreRaw) specifically so every router sharing OTP state
// reads/writes the SAME store without importing across route files. Reusing
// that same global here (rather than re-implementing send/verify) is what
// "reuse existing OTP-send logic unchanged" (PRD §3.3) means in practice —
// the actual code path (generate code, store with 10-min expiry, email it,
// verify against the store) is identical to POST /api/auth/send-otp /
// POST /api/auth/verify-otp; only the caller-identity and post-verify
// side effects differ.
if (!global.__otpStoreRaw) {
  global.__otpStoreRaw = new Map();
}
const otpStoreRaw = global.__otpStoreRaw;
const MAX_ACTIVE_CODES_PER_KEY = 5;

const otpStore = {
  set(key, value) {
    const list = otpStoreRaw.get(key) || [];
    list.push(value);
    if (list.length > MAX_ACTIVE_CODES_PER_KEY) list.splice(0, list.length - MAX_ACTIVE_CODES_PER_KEY);
    otpStoreRaw.set(key, list);
  },
  deleteCode(key, code) {
    const list = otpStoreRaw.get(key);
    if (!list) return;
    const next = list.filter((e) => e.code !== code);
    if (next.length === 0) otpStoreRaw.delete(key);
    else otpStoreRaw.set(key, next);
  },
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

// Role is read from the DATABASE here, never trusted off the JWT's own
// `role` claim. The JWT is minted once at login/OTP-verify time and is NOT
// reissued when a user completes first-time role selection shortly after
// (POST /api/auth/profile returns an updated user object but no fresh
// token — a pre-existing gap in this codebase, see AuthContext.jsx/
// routes/auth.js). A doctor who just finished registration in the SAME
// session is still carrying a token minted with role:'none', so trusting
// req.user.role directly would incorrectly 403 them here. Every other
// role-sensitive check in this codebase (e.g. doctorPatients.js's
// isDoctorLinkedToPatient) already resolves off a fresh DB row rather than
// a token claim — this matches that convention instead of introducing a
// stricter, JWT-trusting one.
async function requirePatientAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
  if (!decoded?.userId) return res.status(401).json({ message: 'Invalid session token.' });

  const user = await findUserById(decoded.userId);
  if (!user) return res.status(401).json({ message: 'Invalid session token.' });
  // Check-in identity verification (OTP) is meaningless for a non-patient
  // account — the whole point is confirming a WALK-IN PATIENT's identity
  // before linking them to the doctor whose code they read off the wall.
  if (user.role !== 'patient') {
    return res.status(403).json({ message: 'Only patient accounts can use clinic check-in.' });
  }
  req.user = { userId: user.id, email: user.email, role: user.role };
  next();
}

// ─────────────────────────────────────────────────────────────────────────
// In-process IP rate limiter for the public verify-code endpoint (PRD §3.3:
// "Public, IP rate-limited"). No rate-limiting dependency exists anywhere
// else in this codebase (checked) — this follows the same in-process Map
// pattern already used for the OTP store in routes/auth.js rather than
// introducing a new package for one route. Fixed window, not sliding —
// simple and sufficient for a code-guessing deterrent on a 6-character
// space; swap for `express-rate-limit`/a shared store if this needs to
// survive multiple server instances.
// ─────────────────────────────────────────────────────────────────────────
const VERIFY_CODE_WINDOW_MS = 60 * 1000;
const VERIFY_CODE_MAX_PER_WINDOW = 10;
const verifyCodeAttempts = new Map(); // ip -> { count, windowStart }

function rateLimitVerifyCode(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const entry = verifyCodeAttempts.get(ip);

  if (!entry || now - entry.windowStart >= VERIFY_CODE_WINDOW_MS) {
    verifyCodeAttempts.set(ip, { count: 1, windowStart: now });
    return next();
  }
  if (entry.count >= VERIFY_CODE_MAX_PER_WINDOW) {
    return res.status(429).json({ message: 'Too many attempts. Please wait a moment and try again.' });
  }
  entry.count += 1;
  next();
}

/**
 * POST /api/clinic/verify-code
 * PUBLIC, IP rate-limited (PRD §3.3). Body: { code }.
 * Returns doctor DISPLAY IDENTITY ONLY on a match — never distinguishes a
 * wrong code, an expired (yesterday's) code, or an unknown doctor; all three
 * produce the exact same generic response (PRD §3.4).
 */
router.post('/verify-code', rateLimitVerifyCode, async (req, res) => {
  const code = String(req.body?.code ?? '').trim();
  if (!code) {
    return res.status(400).json({ message: 'Invalid or expired code.' });
  }

  try {
    const resolved = await resolveCheckinCode(code);
    if (!resolved) {
      // Same generic message as the "not found" path below — deliberately
      // identical wording/status for every failure mode.
      return res.status(404).json({ message: 'Invalid or expired code.' });
    }
    return res.json({
      doctorId: resolved.doctorId,
      doctorName: resolved.doctorName,
      clinicName: resolved.clinicName,
    });
  } catch (error) {
    console.error('Clinic verify-code error:', error);
    // Deliberately the SAME generic message on an unexpected server error
    // too — an attacker probing for behavioral differences between "bad
    // code" and "server hiccup" learns nothing new either way.
    return res.status(404).json({ message: 'Invalid or expired code.' });
  }
});

/**
 * POST /api/clinic/send-otp
 * JWT (patient) auth. Reuses the existing OTP-send logic unchanged,
 * targeting the AUTHENTICATED PATIENT's own account email — never a
 * client-supplied address, so a patient cannot trigger an OTP to someone
 * else's inbox.
 */
router.post('/send-otp', requirePatientAuth, async (req, res) => {
  const email = (req.user.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(400).json({ message: 'No email on file for this account.' });
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(email, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });

  try {
    await sendOTPEmail(email, otpCode);
    return res.json({ message: `Verification code sent to ${email}` });
  } catch (error) {
    otpStore.deleteCode(email, otpCode);
    console.error('Clinic send-otp error:', error);
    return res.status(500).json({ message: 'Failed to send verification code.', error: error.message });
  }
});

/**
 * POST /api/clinic/verify-otp
 * JWT (patient) auth. Body: { doctorId, otpCode }.
 * On success: upserts the doctor-patient link to accepted, creates an
 * intake_sessions row with origin='clinic_checkin' and intake_method
 * resolved from the DOCTOR's own row (never patient-supplied), then hands
 * back the same shape POST /api/intake/start returns so the frontend can
 * drop straight into the existing chat UI and call POST /api/intake/turn
 * for every subsequent message, unchanged.
 */
router.post('/verify-otp', requirePatientAuth, async (req, res) => {
  const patientId = req.user.userId;
  const doctorId = String(req.body?.doctorId ?? '').trim();
  const otpCode = String(req.body?.otpCode ?? '').trim();

  if (!doctorId) {
    return res.status(400).json({ message: 'doctorId is required.' });
  }
  if (!otpCode || otpCode.length !== 6) {
    return res.status(400).json({ message: 'Valid 6-digit OTP code is required.' });
  }

  const email = (req.user.email || '').toLowerCase().trim();
  const isValid = otpStore.verify(email, otpCode);
  if (!isValid) {
    return res.status(400).json({ message: 'Invalid or expired verification code.' });
  }

  try {
    // Resolve intake_method from the doctor's OWN row, server-side — PRD
    // §3.4: "resolved from the doctor's own row, never patient-supplied".
    // A bad/unknown doctorId at this stage (after the code-verify screen
    // already confirmed identity) fails safe rather than defaulting silently.
    const doctor = await findUserById(doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(400).json({ message: 'Unable to complete check-in for this doctor.' });
    }
    const intakeMethod = doctor.treatment_method === 'ayurvedic' ? 'ayurvedic' : 'allopathic';

    await upsertAcceptedLink({ doctorId, patientId });

    // Patient-chosen on the language screen shown before this call (Voice
    // Layer PRD §6 — asked once, stored on the session row). Unlike
    // intakeMethod above this IS patient-supplied, since it's their own
    // reading/listening preference rather than a clinical setting; an
    // unrecognised value falls back to the default rather than failing.
    const language = req.body?.language === 'en-IN' ? 'en-IN' : 'hi-IN';

    const { session, turn } = await startIntakeSession(patientId, {
      doctorId,
      intakeMethod,
      origin: 'clinic_checkin',
      language,
    });

    // Same audio fields POST /rag/api/intake/start returns — this endpoint
    // is the other way a session gets created, so it has to speak the first
    // question too or a clinic check-in patient gets a silent opener while
    // every later turn talks. A TTS failure just omits the audio fields;
    // it never blocks the check-in.
    const speech = await synthesizeSpeech(turn.next_question, language);

    return res.status(200).json({
      session_id: session.id,
      next_question: turn.next_question,
      quick_reply_options: turn.quick_reply_options,
      section: turn.section,
      red_flag: turn.red_flag,
      language,
      ...(speech.ok
        ? {
            audio_base64: speech.audio_base64,
            audio_mime_type: speech.mime_type,
            audio_provider: speech.provider,
            audio_degraded: !!speech.degraded,
          }
        : {}),
    });
  } catch (error) {
    console.error('Clinic verify-otp error:', error);
    return res.status(500).json({ message: 'Could not complete check-in.' });
  }
});

// Same DB-resolved-role reasoning as requirePatientAuth above — a doctor
// who just completed registration in this session is still carrying a
// token minted before role selection.
async function requireDoctorAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
  if (!decoded?.userId) return res.status(401).json({ message: 'Invalid session token.' });

  const user = await findUserById(decoded.userId);
  if (!user) return res.status(401).json({ message: 'Invalid session token.' });
  if (user.role !== 'doctor') {
    return res.status(403).json({ message: 'Only doctor accounts can view a check-in code.' });
  }
  req.user = { userId: user.id, email: user.email, role: user.role };
  next();
}

/**
 * GET /api/clinic/today-code
 * DOCTOR-facing (JWT). Lazily creates/returns today's check-in code for the
 * CALLING doctor — doctorId comes from req.user.userId, never a param, so a
 * doctor can only ever fetch their own code (PRD §3.2/§5: dashboard display,
 * auto-refreshing at local midnight — the lazy-generation-per-day here is
 * what makes that refresh work without a cron job).
 */
router.get('/today-code', requireDoctorAuth, async (req, res) => {
  try {
    const { code, valid_date: validDate } = await getOrCreateTodayCode(req.user.userId);
    return res.json({ code, validDate });
  } catch (error) {
    console.error('Clinic today-code error:', error);
    return res.status(500).json({ message: 'Unable to load today’s check-in code.' });
  }
});

/**
 * Upserts a doctor_patient link straight to 'accepted' for the clinic
 * check-in flow — PRD §3.1/§3.3: "upsert doctor-patient link to accepted"
 * on successful OTP verification, no separate patient-approval step (the
 * walk-in physically being at the clinic and passing OTP IS the consent).
 * Deliberately NOT reusing linkDoctorToPatient() from db/doctorPatients.js:
 * that function creates a PENDING request needing the patient's separate
 * approval (the remote-linking flow's whole point), which is the wrong
 * state transition here. This does the same idempotent upsert but writes
 * status='accepted' directly, matching isDoctorLinkedToPatient's gate.
 *
 * access_expires_at is stamped on BOTH branches below, from the same
 * accessExpiryFromNow() the remote accept flow uses. It was previously
 * omitted entirely here, which is an access-control bug rather than a
 * cosmetic gap: isAccessExpired() reads a null access_expires_at as "no
 * expiry on record" and returns false, so a link created by clinic
 * check-in granted the doctor PERMANENT access to that patient's health
 * data, while an otherwise-identical link created through the remote
 * request/accept flow correctly lapsed after 24h. The two flows now agree.
 */
async function upsertAcceptedLink({ doctorId, patientId }) {
  if (!supabase) throw new Error('Database connection is unavailable.');

  // Deliberately NOT short-circuiting on an already-linked pair the way
  // this used to (`if (await isDoctorLinkedToPatient(...)) return;`). A
  // patient physically checking in again at the clinic is a fresh in-person
  // consent, and the doctor's 24h window should restart from that check-in
  // — returning early left them on whatever window the previous link
  // carried, or, for a row created before this fix, on no window at all.
  const { data: existingLink } = await supabase
    .from('doctor_patient')
    .select('id, status')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientId)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  if (existingLink) {
    // Covers both 'pending' (a doctor had previously requested access
    // remotely — the walk-in check-in now confirms it) and 'declined' (the
    // in-person OTP-verified check-in is a stronger, fresh consent signal
    // than a past remote decline, so it supersedes it here) by moving
    // straight to 'accepted', matching PRD §3.1's "upsert ... to accepted".
    const { error } = await supabase
      .from('doctor_patient')
      .update({
        status: 'accepted',
        responded_at: nowIso,
        email_action_token: null,
        access_expires_at: accessExpiryFromNow(),
      })
      .eq('id', existingLink.id);
    if (error) throw new Error(`upsertAcceptedLink: failed to accept existing link: ${error.message}`);
    return;
  }

  const patient = await findUserById(patientId);
  const { error } = await supabase.from('doctor_patient').insert({
    doctor_id: doctorId,
    patient_id: patientId,
    patient_email: patient?.email || null,
    patient_name: patient?.name || patient?.fullName || patient?.email || 'Patient',
    patient_phone: patient?.phone || patient?.mobile || patient?.phone_number || null,
    patient_gender: patient?.gender || 'U',
    patient_dob: patient?.dob || patient?.date_of_birth || patient?.dateOfBirth || null,
    patient_blood_group: patient?.blood_group || patient?.bloodGroup || patient?.blood_type || null,
    status: 'accepted',
    created_at: nowIso,
    responded_at: nowIso,
    access_expires_at: accessExpiryFromNow(),
  });
  if (error) throw new Error(`upsertAcceptedLink: failed to create accepted link: ${error.message}`);
}

export default router;
