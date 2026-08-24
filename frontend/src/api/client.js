const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// Parses the response body (tolerating a non-JSON/empty body) and throws on
// any non-2xx status, using the server's { message } / { error } if present.
// Without this, every caller across the app (login, register, delete
// account, ...) silently treated failed requests as successes — e.g.
// DeleteAccountModal would log the user out and navigate away even when the
// server never deleted the account, leaving all patient/queue records intact
// for the next registration with the same email to pick back up.
async function parseResponse(res) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body — fall through with data = null
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiGet(path, options = {}) {
  const headers = { ...(options.headers || {}), ...(getAuthHeader()) };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  return parseResponse(res)
}

export async function apiPost(path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}), ...(getAuthHeader()) };
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    ...options,
    headers,
    body: JSON.stringify(body),
  })
  return parseResponse(res)
}

export function getStoredToken() {
  try {
    return localStorage.getItem('swastha_token') || sessionStorage.getItem('swastha_token') || null;
  } catch {
    return null;
  }
}

export function getAuthHeader(token) {
  const t = token || getStoredToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
}

export default { apiGet, apiPost, getStoredToken, getAuthHeader };
