import { getAuthHeader } from './client';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;

function getStoredToken() {
  try {
    return localStorage.getItem('swastha_token') || sessionStorage.getItem('swastha_token');
  } catch {
    return null;
  }
}

async function request(path, options = {}, token) {
  const authToken = token || getStoredToken();
  const headers = {
    ...(options.headers || {}),
    ...(getAuthHeader(authToken)),
  };

  const response = await fetch(`${API_BASE_URL}/reports${path}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || 'Report request failed');
    error.details = data;
    throw error;
  }

  return data;
}

function preparePayload(reportData, file) {
  const targetFile = file || (reportData?.file instanceof File ? reportData.file : null);
  if (!targetFile) {
    const { file: _ignored, ...cleanData } = reportData || {};
    return {
      body: JSON.stringify(cleanData),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const formData = new FormData();
  formData.append('file', targetFile);

  if (reportData) {
    Object.keys(reportData).forEach((key) => {
      if (key === 'file') return;
      const value = reportData[key];
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      }
    });
  }

  return {
    body: formData,
    headers: {},
  };
}

export async function getTimelineReports(token, memberEmail, memberUserId) {
  const params = new URLSearchParams();

  if (memberEmail) {
    params.set('email', memberEmail);
  }

  if (memberUserId) {
    params.set('userId', memberUserId);
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  return request(query || '/', {}, token);
}

export async function createTimelineReport(reportData, token, file) {
  const { body, headers } = preparePayload(reportData, file);
  return request('/', {
    method: 'POST',
    headers,
    body,
  }, token);
}

export async function updateTimelineReport(reportId, reportData, token, file) {
  const { body, headers } = preparePayload(reportData, file);
  return request(`/${encodeURIComponent(reportId)}`, {
    method: 'PUT',
    headers,
    body,
  }, token);
}

export async function deleteTimelineReport(reportId, token) {
  return request(`/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  }, token);
}

export async function generateReportSummary(reportId, token) {
  return request(`/${encodeURIComponent(reportId)}/summarize`, {
    method: 'POST',
  }, token);
}

export async function getLabInsights(token) {
  return request('/lab-insights', {}, token);
}

export default {
  getTimelineReports,
  createTimelineReport,
  updateTimelineReport,
  deleteTimelineReport,
  generateReportSummary,
  getLabInsights,
};
