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
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

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

export async function getTimelineReports() {
  return request('/');
}

export async function createTimelineReport(reportData) {
  return request('/', {
    method: 'POST',
    body: JSON.stringify(reportData),
  });
}

export async function deleteTimelineReport(reportId) {
  return request(`/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  });
}

export default {
  getTimelineReports,
  createTimelineReport,
  deleteTimelineReport,
};
