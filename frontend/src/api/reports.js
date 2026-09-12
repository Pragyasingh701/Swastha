import { apiRequest, BASE_URL } from './client';
import { attachEncryptedFields } from './pii/multipart.js';
import { encryptParamsEnvelope } from './pii/walk.js';

function request(path, options = {}, token) {
  return apiRequest(options.method || 'GET', `/reports${path}`, { ...options, token });
}

// FormData bodies aren't run through apiRequest's automatic per-field
// encryption (that only applies to plain JSON objects) — when a file is
// attached, the non-file fields are bundled through attachEncryptedFields
// instead, which uses the same sensitive-field walker.
async function preparePayload(reportData, file) {
  const targetFile = file || (reportData?.file instanceof File ? reportData.file : null);
  const { file: _ignored, ...cleanData } = reportData || {};

  if (!targetFile) {
    return { body: cleanData };
  }

  const formData = new FormData();
  formData.append('file', targetFile);
  await attachEncryptedFields(formData, cleanData, BASE_URL);
  return { body: formData };
}

export async function getTimelineReports(token, memberEmail, memberUserId) {
  const headers = {};
  if (memberEmail || memberUserId) {
    const params = {};
    if (memberEmail) params.email = memberEmail;
    if (memberUserId) params.userId = memberUserId;
    // email/userId used to ride in the URL query string, which is more
    // exposed to incidental logging (proxy/access logs, browser history)
    // than a request body or header — moved to one encrypted header value
    // instead. backend/routes/reports.js still just reads req.query.email/
    // req.query.userId, unchanged: the wire-crypto middleware decrypts this
    // header and merges it into req.query before the route ever sees it.
    headers['X-Enc-Params'] = await encryptParamsEnvelope(params, BASE_URL);
  }
  return request('/', { headers }, token);
}

export async function createTimelineReport(reportData, token, file) {
  const { body } = await preparePayload(reportData, file);
  return request('/', {
    method: 'POST',
    body,
  }, token);
}

export async function updateTimelineReport(reportId, reportData, token, file) {
  const { body } = await preparePayload(reportData, file);
  return request(`/${encodeURIComponent(reportId)}`, {
    method: 'PUT',
    body,
  }, token);
}

export async function deleteTimelineReport(reportId, token, targetUserId, targetEmail) {
  const headers = {};
  if (targetUserId || targetEmail) {
    const params = {};
    if (targetUserId) params.userId = targetUserId;
    if (targetEmail) params.email = targetEmail;
    headers['X-Enc-Params'] = await encryptParamsEnvelope(params, BASE_URL);
  }

  return request(`/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
    headers,
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
