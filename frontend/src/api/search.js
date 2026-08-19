// Talks to the standalone rag/ service (separate process/port from
// backend/) — see rag/README.md. Uses the same stored JWT as the rest of
// the app; the rag service verifies it itself.
const RAG_BASE_URL = import.meta.env.VITE_RAG_BASE_URL || 'http://localhost:3010/api';

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
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${RAG_BASE_URL}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Search request failed');
    error.details = data;
    throw error;
  }
  return data;
}

/**
 * Ask a natural-language question over the current user's health records.
 * Returns { answer, sources, noResultsFound }.
 */
export async function searchReports(query) {
  return request('/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

/**
 * Index a report for semantic search after it's been saved via
 * backend/api/reports. Fire-and-forget from the caller's perspective —
 * a failure here means the report just isn't searchable yet, it does not
 * mean the save failed.
 */
export async function indexReport(report) {
  return request('/reports/index', {
    method: 'POST',
    body: JSON.stringify(report),
  });
}

/**
 * Remove a report from the search index after it's been deleted via
 * backend/api/reports/:id.
 */
export async function removeReportFromIndex(reportId) {
  return request(`/reports/index/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  });
}

/**
 * Ask a conversational (multi-turn) question, with memory scoped to
 * session_id. patientUserId is optional — a doctor passes it to ask about
 * a specific linked patient's records instead of their own; the rag
 * service verifies the doctor_patient link on every call, so an
 * unauthorized patientUserId fails server-side regardless of what the
 * frontend sends.
 * Returns { answer, structured, sources, noResultsFound, session_id }.
 */
export async function searchReportsConversational(query, sessionId, patientUserId) {
  return request('/search/chat', {
    method: 'POST',
    body: JSON.stringify({
      query,
      session_id: sessionId,
      ...(patientUserId ? { patient_user_id: patientUserId } : {}),
    }),
  });
}

/**
 * Clear a conversation's memory (e.g. the doctor switches to a different
 * patient, or starts a fresh chat with the same one).
 */
export async function clearConversation(sessionId, patientUserId) {
  return request(`/search/chat/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    body: JSON.stringify(patientUserId ? { patient_user_id: patientUserId } : {}),
  });
}

/**
 * Upload a medical report image and get back AI-extracted fields
 * (title, doctor, hospital, diagnosis, medicines, notes, ...) for the user
 * to review/edit before saving. Does not save anything itself — the file
 * upload for the saved report's fileUrl still goes through
 * backend/api/auth/upload as before, this is extraction-only.
 * Returns { fields }.
 */
export async function extractReportFromFile(file) {
  const token = getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${RAG_BASE_URL}/extract`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form, // no Content-Type header — browser sets the multipart boundary itself
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Extraction request failed');
    error.details = data;
    throw error;
  }
  return data;
}

export default {
  searchReports,
  searchReportsConversational,
  clearConversation,
  indexReport,
  removeReportFromIndex,
  extractReportFromFile,
};
