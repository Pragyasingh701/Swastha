// Talks to the standalone rag/ service (separate process/port from
// backend/) — see rag/README.md. Uses the same stored JWT as the rest of
// the app; the rag service verifies it itself.
const RAG_BASE_URL = import.meta.env.VITE_RAG_BASE_URL || 'http://localhost:3010/api';
import { getAuthHeader } from './client';

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

  const response = await fetch(`${RAG_BASE_URL}${path}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'Search request failed');
    error.details = data;
    throw error;
  }
  return data;
}

export async function searchReports(query) {
  return request('/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function indexReport(report) {
  return request('/reports/index', {
    method: 'POST',
    body: JSON.stringify(report),
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
    body: JSON.stringify({
      query,
      session_id: sessionId,
      ...(patientUserId ? { patient_user_id: patientUserId } : {}),
    }),
  });
}

export async function clearConversation(sessionId, patientUserId) {
  return request(`/search/chat/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    body: JSON.stringify(patientUserId ? { patient_user_id: patientUserId } : {}),
  });
}

export async function extractReportFromFile(file) {
  const token = getStoredToken();
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(`${RAG_BASE_URL}/extract`, {
    method: 'POST',
    headers: token ? getAuthHeader(token) : undefined,
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

export default { searchReports, indexReport, removeReportFromIndex, searchReportsConversational, clearConversation, extractReportFromFile };
