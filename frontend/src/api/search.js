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

export default { searchReports, indexReport, removeReportFromIndex, extractReportFromFile };


