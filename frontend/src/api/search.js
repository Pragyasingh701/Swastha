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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Indexing can fail for a moment (the embedding provider is busy, a network blip). Try again
// a couple of times before giving up; a refusal (no consent, no access) will not improve.
export async function indexReportWithRetry(report, { delaysMs = [3000, 10000] } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await indexReport(report);
    } catch (err) {
      lastError = err;
      if (err?.status >= 400 && err?.status < 500) break;
      if (attempt < delaysMs.length) await sleep(delaysMs[attempt]);
    }
  }
  throw lastError;
}

// Catches up any of the user's own reports that never got indexed.
export async function indexMissingReports() {
  return request('/reports/index-missing', { method: 'POST', body: {} });
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

// A multipart upload with no PII field of its own (just the file), so the form body does not
// depend on the wire-encryption key and can be replayed as it is.
export async function extractReportFromFile(file) {
  const form = new FormData();
  form.append('file', file);
  try {
    return await request('/extract', { method: 'POST', body: form });
  } catch (error) {
    // Callers read the server's full answer from `details`.
    if (error.data !== undefined) error.details = error.data;
    throw error;
  }
}

export default {
  searchReports,
  indexReport,
  searchReportsConversational,
  clearConversation,
  extractReportFromFile,
  submitAnswerFeedback,
};
