// Talks to the rag/ sub-app, mounted inside this same backend process at
// /rag (see backend/rag/app.js) — not a separate service, despite the
// dedicated env var below.
import { apiRequest, getAuthHeader, notifyAiNoticeRequired } from './client';
import { decryptPiiFields } from './pii/walk.js';
import { ensureSession } from './pii/session.js';
import { RAG_BASE_URL } from './config.js';


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

// rating: 'up' | 'down'. mode/sourceReportIds/degraded describe the answer
// bubble being rated (echoed back from what searchReportsConversational
// already returned) — user_id itself is never sent from here, the backend
// reads it from the JWT.
export async function submitAnswerFeedback({ rating, mode, sourceReportIds, degraded }) {
  return request('/search/feedback', {
    method: 'POST',
    body: {
      rating,
      ...(mode ? { mode } : {}),
      ...(sourceReportIds ? { source_report_ids: sourceReportIds } : {}),
      ...(degraded ? { degraded: true } : {}),
    },
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
    if (response.status === 403 && data?.code === 'AI_NOTICE_ACK_REQUIRED') {
      notifyAiNoticeRequired(data.feature);
    }
    const error = new Error(data.error || data.message || 'Extraction request failed');
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

export default {
  searchReports,
  indexReport,
  searchReportsConversational,
  clearConversation,
  extractReportFromFile,
  submitAnswerFeedback,
};
