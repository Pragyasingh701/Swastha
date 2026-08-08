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
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
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

export async function getTimelineReports(token, memberEmail) {
  const query = memberEmail ? `?email=${encodeURIComponent(memberEmail)}` : '';
  return request(query || '/', {}, token);
}

export async function createTimelineReport(reportData, token) {
  return request('/', {
    method: 'POST',
    body: JSON.stringify(reportData),
  }, token);
}

export async function deleteTimelineReport(reportId, token) {
  return request(`/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
  }, token);
}

export default {
  getTimelineReports,
  createTimelineReport,
  deleteTimelineReport,
};
