import { getAuthHeader } from '../api/client';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

function getStoredAuth() {
  try {
    const localToken = localStorage.getItem('swastha_token');
    const sessionToken = sessionStorage.getItem('swastha_token');
    return {
      token: localToken || sessionToken || null,
    };
  } catch {
    return { token: null };
  }
}

async function request(path, options = {}) {
  const { token } = getStoredAuth();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(getAuthHeader(token)),
  };

  const response = await fetch(`${API_BASE_URL}/doctor-patients${path}`, {
    ...options,
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Doctor patients request failed');
  }

  return data;
}

export async function getDoctorPatients() {
  const result = await request('/');
  return result.patients || [];
}

export async function linkPatientToDoctor(patientCode) {
  const result = await request('/link', {
    method: 'POST',
    body: { patientCode },
  });
  return result;
}

export async function deletePatientFromDoctor(patientId, linkId = null) {
  const result = await request(`/${patientId}`, {
    method: 'DELETE',
    body: linkId ? { linkId } : {},
  });
  return result;
}

/**
 * Doctor-facing single-patient detail. The server enforces status ===
 * 'accepted' and returns 403 otherwise — this call must only ever be
 * triggered for a card the UI already knows is accepted (never for a
 * pending/declined card), so a 403 here would indicate a UI bug, not an
 * expected outcome.
 */
export async function getDoctorPatientDetail(patientId) {
  return request(`/${patientId}`);
}

/**
 * DOCTOR-facing: AI summary of a patient's full record timeline (Clinical
 * Intelligence page). Regenerated fresh on every call — see
 * backend/routes/doctorPatients.js's GET /:patientId/summary for why
 * there's no caching here.
 */
export async function getDoctorPatientSummary(patientId) {
  return request(`/${patientId}/summary`);
}

/**
 * PATIENT-facing: doctor link requests awaiting this patient's response.
 */
export async function getPendingDoctorRequests() {
  const result = await request('/pending-requests');
  return result.requests || [];
}

/** PATIENT-facing: accept a pending doctor link request. */
export async function acceptDoctorRequest(linkId) {
  return request(`/requests/${linkId}/accept`, { method: 'POST' });
}

/** PATIENT-facing: decline a pending doctor link request. */
export async function declineDoctorRequest(linkId) {
  return request(`/requests/${linkId}/decline`, { method: 'POST' });
}

/**
 * Bell-icon notification feed for whichever side the logged-in user is on
 * (server dispatches on the caller's own JWT role — see
 * backend/routes/doctorPatients.js's GET /notifications). Each entry:
 * { id, linkId, type, at, doctorName? , patientName? }.
 */
export async function getDoctorPatientNotifications() {
  const result = await request('/notifications');
  return result.notifications || [];
}

/**
 * DOCTOR-facing: Module A intake queue (GET /api/doctor-patients/intake-queue).
 * Sessions for every 'accepted'-linked patient, sorted priority desc
 * (flagged first) then created_at asc — same order the server enforces,
 * not re-sorted here.
 */
export async function getIntakeQueue() {
  const result = await request('/intake-queue');
  return result.sessions || [];
}

/**
 * DOCTOR-facing: full detail for one intake session (structured_history
 * included) — GET /api/doctor-patients/intake-queue/:sessionId.
 */
export async function getIntakeSessionDetail(sessionId) {
  return request(`/intake-queue/${sessionId}`);
}

export default {
  getDoctorPatients,
  linkPatientToDoctor,
  deletePatientFromDoctor,
  getDoctorPatientDetail,
  getDoctorPatientSummary,
  getPendingDoctorRequests,
  acceptDoctorRequest,
  declineDoctorRequest,
  getDoctorPatientNotifications,
  getIntakeQueue,
  getIntakeSessionDetail,
};
