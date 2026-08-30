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

export async function startIntake(language) {
  return request('/intake/start', {
    method: 'POST',
    body: JSON.stringify(language ? { language } : {}),
  });
}

/**
 * Issue #4 fix (audit report): rehydrates an in-progress session after a
 * page refresh/tab-close, instead of the previous behavior of silently
 * abandoning it and starting a new one every time. Returns the same
 * { session_id, section, quick_reply_options, red_flag, language } shape
 * startIntake/sendIntakeTurn return, plus the full `messages` transcript so
 * the chat UI can redraw every prior bubble, not just the latest question.
 *
 * Callers should treat any failure (404 for "not found/not yours/already
 * finished", or a network error) as "nothing to resume" and fall through to
 * starting a fresh session — this is a best-effort convenience, never a
 * hard gate on being able to use intake at all.
 */
export async function resumeIntake(sessionId) {
  return request(`/intake/${encodeURIComponent(sessionId)}`, { method: 'GET' });
}

/**
 * Voice layer (Phase 7b). Uploads one recorded answer and returns
 * { transcript, language_code }. Does NOT advance the dialogue — the
 * transcript goes into the patient's answer field for review/editing, and
 * only the (possibly corrected) text is then sent through sendIntakeTurn
 * exactly as a typed answer would be.
 *
 * Not routed through request() above: that helper sets a JSON content-type
 * and stringifies the body, whereas this needs multipart with the browser
 * setting its own boundary.
 */
export async function transcribeIntakeAudio(sessionId, audioBlob) {
  const token = getStoredToken();
  const form = new FormData();
  // Filename is required by some servers to infer type; the extension is
  // cosmetic since the backend trusts the blob's MIME type.
  form.append('file', audioBlob, 'answer.webm');
  form.append('session_id', sessionId);

  const response = await fetch(`${RAG_BASE_URL}/intake/transcribe`, {
    method: 'POST',
    headers: { ...(getAuthHeader(token)) },
    body: form,
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Could not transcribe audio');
    error.code = data.error;
    error.status = response.status;
    throw error;
  }
  return data;
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

/**
 * Re-speaks a question the patient has already been asked, so any earlier
 * question in the transcript can be replayed. Read-only — does not advance
 * or otherwise change the conversation.
 */
export async function replayIntakeAudio(sessionId, text) {
  return request('/intake/replay-audio', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, text }),
  });
}

export default { startIntake, resumeIntake, sendIntakeTurn, finalizeIntake, transcribeIntakeAudio, replayIntakeAudio };
