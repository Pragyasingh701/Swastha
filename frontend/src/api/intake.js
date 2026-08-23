// Module A (Conversational History Engine) — talks to the rag/ sub-app's
// intake routes (backend/rag/routes/intake.js), same merged server as
// search.js. Uses the same stored JWT as the rest of the app.
const RAG_BASE_URL = import.meta.env.VITE_RAG_BASE_URL || 'http://localhost:5001/rag/api';
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
    const error = new Error(data.error || data.message || 'Intake request failed');
    error.details = data;
    throw error;
  }
  return data;
}

export async function startIntake() {
  return request('/intake/start', { method: 'POST' });
}

export async function sendIntakeTurn(sessionId, message) {
  return request('/intake/turn', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export async function finalizeIntake(sessionId) {
  return request('/intake/finalize', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export default { startIntake, sendIntakeTurn, finalizeIntake };
