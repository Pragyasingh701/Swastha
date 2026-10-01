// Talks to the rag/ sub-app's notice-acknowledgement endpoints (see
// backend/rag/routes/notices.js) — same base URL as api/search.js and
// api/intake.js, since this is mounted inside the same /rag sub-app.
import { apiRequest } from './client';

const RAG_BASE_URL = import.meta.env.VITE_RAG_BASE_URL || 'http://localhost:5001/rag/api';

function request(path, options = {}) {
  return apiRequest(options.method || 'GET', path, { ...options, baseUrl: RAG_BASE_URL });
}

export async function getNoticeAckStatus(feature) {
  return request(`/notices/ack/${encodeURIComponent(feature)}`);
}

export async function acknowledgeNotice(feature) {
  return request('/notices/ack', { method: 'POST', body: { feature } });
}

export default { getNoticeAckStatus, acknowledgeNotice };
