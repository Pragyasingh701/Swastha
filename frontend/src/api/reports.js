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

export async function getTimelineReports(token, memberEmail) {
  const query = memberEmail ? `?email=${encodeURIComponent(memberEmail)}` : '';
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

// On-demand AI summary generation for a report that doesn't have one yet.
// Normally the summary is already generated at save time; this is the
// fallback path for reports saved before that existed, or where
// generation failed. Returns { report } with `analysis` now populated.
export async function generateReportSummary(reportId, token) {
  return request(`/${encodeURIComponent(reportId)}/summarize`, {
    method: 'POST',
  }, token);
}

// Real Lab Insights: fetches the user's Lab Report entries and an
// AI-generated {healthScore, series (extracted numeric trends),
// physicianSummary, followUps} built from them. Returns
// { insights: null, labReportCount: 0 } when there are no lab reports yet.
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
