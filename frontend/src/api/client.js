const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`)
  return res.json()
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
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
