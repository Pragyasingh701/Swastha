// Talks to the rag/ sub-app, mounted inside this same backend process at
// /rag (see backend/rag/app.js) — not a separate service, despite the
// dedicated env var below.
import { apiRequest, getAuthHeader } from './client';
import { decryptPiiFields } from './pii/walk.js';
import { ensureSession } from './pii/session.js';

const RAG_BASE_URL = import.meta.env.VITE_RAG_BASE_URL || 'http://localhost:5001/rag/api';

function request(path, options = {}) {
  return apiRequest(options.method || 'GET', path, { ...options, baseUrl: RAG_BASE_URL });
}

export async function searchReports(query) {
  return request('/search', {
    method: 'POST',
    body: { query },
  });
}

export async function indexReport(report) {
  return request('/reports/index', {
    method: 'POST',
    body: report,
  });
}

export async function removeReportFromIndex(reportId) {
  return request(`/reports/index/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  });
}

export async function searchReportsConversational(query, sessionId, patientUserId) {
  return request('/search/chat', {
    method: 'POST',
    body: {
      query,
      session_id: sessionId,
      ...(patientUserId ? { patient_user_id: patientUserId } : {}),
    },
  });
}

export async function clearConversation(sessionId, patientUserId) {
  return request(`/search/chat/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    body: patientUserId ? { patient_user_id: patientUserId } : {},
  });
}

// Not routed through request() above: this is a multipart upload (no PII
// field of its own — just the file), so it only needs the response side
// of the wire-crypto boundary, applied manually here.
export async function extractReportFromFile(file) {
  const form = new FormData();
  form.append('file', file);

  const { sessionId } = await ensureSession(RAG_BASE_URL);
  const response = await fetch(`${RAG_BASE_URL}/extract`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'X-Enc-Session-Id': sessionId },
    body: form, // no Content-Type header — browser sets the multipart boundary itself
  });
  let data = await response.json();
  data = await decryptPiiFields(data, RAG_BASE_URL);
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Extraction request failed');
    error.details = data;
    throw error;
  }
  return data;
}

export default { searchReports, indexReport, removeReportFromIndex, searchReportsConversational, clearConversation, extractReportFromFile };
