// Clinic Check-In flow — talks to backend/routes/clinic.js, mounted at
// /api/clinic on the main backend (same base as api/client.js's
// doctor-patients calls, NOT the /rag/api base api/intake.js uses — see
// backend/routes/clinic.js's header comment for why these routes live in
// the main backend rather than the rag/ sub-app).
import { getAuthHeader } from './client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

function getStoredToken() {
  try {
    return localStorage.getItem('swastha_token') || sessionStorage.getItem('swastha_token');
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(getAuthHeader(token)),
  };

  const response = await fetch(`${API_BASE_URL}/clinic${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Clinic check-in request failed');
    error.details = data;
    throw error;
  }
  return data;
}

/**
 * PUBLIC — resolves a doctor-displayed code to display identity only
 * ({ doctorId, doctorName, clinicName }). No auth header needed/sent.
 */
export async function verifyClinicCode(code) {
  return request('/verify-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** PATIENT-facing: send an OTP to the logged-in patient's own account email. */
export async function sendClinicOtp() {
  return request('/send-otp', { method: 'POST' });
}

/**
 * PATIENT-facing: verify the OTP and complete check-in. On success returns
 * the same shape POST /api/intake/start does — { session_id, next_question,
 * quick_reply_options, section, red_flag } — ready to hand straight into
 * IntakeChat.jsx.
 */
export async function verifyClinicOtp({ doctorId, otpCode }) {
  return request('/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ doctorId, otpCode }),
  });
}

/** DOCTOR-facing: today's check-in code (lazily created on first call each day). */
export async function getTodayCheckinCode() {
  return request('/today-code');
}

export default { verifyClinicCode, sendClinicOtp, verifyClinicOtp, getTodayCheckinCode };
