// Clinic Check-In flow — talks to backend/routes/clinic.js, mounted at
// /api/clinic on the main backend (same base as api/client.js's
// doctor-patients calls, NOT the /rag/api base api/intake.js uses — see
// backend/routes/clinic.js's header comment for why these routes live in
// the main backend rather than the rag/ sub-app).
import { apiRequest } from './client';

function request(path, options = {}) {
  return apiRequest(options.method || 'GET', `/clinic${path}`, options);
}

/**
 * PUBLIC — resolves a doctor-displayed code to display identity only
 * ({ doctorId, doctorName, clinicName }). No auth header needed/sent.
 */
export async function verifyClinicCode(code) {
  return request('/verify-code', {
    method: 'POST',
    body: { code },
  });
}

/**
 * PATIENT-facing: complete check-in for the confirmed doctor. On success
 * returns the same shape POST /api/intake/start does — { session_id,
 * next_question, quick_reply_options, section, red_flag } — ready to hand
 * straight into IntakeChat.jsx.
 */
export async function verifyClinicOtp({ doctorId, language }) {
  return request('/verify-otp', {
    method: 'POST',
    body: { doctorId, ...(language ? { language } : {}) },
  });
}

/** DOCTOR-facing: today's check-in code (lazily created on first call each day). */
export async function getTodayCheckinCode() {
  return request('/today-code');
}

export default { verifyClinicCode, verifyClinicOtp, getTodayCheckinCode };
