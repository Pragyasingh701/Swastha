import { encryptPiiFields, decryptPiiFields } from './pii/walk.js'
import { ensureSession, invalidateSession } from './pii/session.js'

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

// Parses the response body (tolerating a non-JSON/empty body), decrypts any
// designated PII fields in it, and throws on any non-2xx status, using the
// server's { message } / { error } if present. Without the non-2xx throw,
// every caller across the app (login, register, delete account, ...) would
// silently treat failed requests as successes — e.g. DeleteAccountModal
// would log the user out and navigate away even when the server never
// deleted the account, leaving all patient/queue records intact for the
// next registration with the same email to pick back up.
async function parseResponse(res, baseUrl) {
  let data = null
  try {
    data = await res.json()
  } catch {
    // empty or non-JSON body — fall through with data = null
  }
  if (data && typeof data === 'object') {
    data = await decryptPiiFields(data, baseUrl)
  }
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Request failed with status ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.data = data
    err.details = data?.details
    err.fieldErrors = data?.fieldErrors
    err.errorCode = data?.errorCode
    err.errorHint = data?.errorHint
    err.errorDetails = data?.errorDetails
    throw err
  }
  return data
}

async function doRequest(method, path, options, allowRetry) {
  const { body, query, token, headers = {}, baseUrl } = options
  const resolvedBaseUrl = baseUrl || BASE_URL

  let url = `${resolvedBaseUrl}${path}`
  if (query && Object.keys(query).length > 0) {
    url += `?${new URLSearchParams(query).toString()}`
  }

  const finalHeaders = { ...headers, ...getAuthHeader(token) }

  // FormData bodies pass through untouched (no Content-Type — the browser
  // sets its own multipart boundary); any sensitive fields riding alongside
  // a file go through pii/multipart.js's attachEncryptedFields instead,
  // called by the caller before reaching here. A plain object gets every
  // designated sensitive field encrypted in place, then stringified.
  let finalBody
  if (body instanceof FormData) {
    finalBody = body
  } else if (body !== undefined) {
    finalBody = JSON.stringify(await encryptPiiFields(body, resolvedBaseUrl))
    finalHeaders['Content-Type'] = 'application/json'
  }

  // Establishes the wire-crypto session (once per origin, per page load) if
  // this is the first call — every request carries it, including a plain
  // GET, so the server knows whether/how to encrypt its response back.
  const { sessionId } = await ensureSession(resolvedBaseUrl)
  finalHeaders['X-Enc-Session-Id'] = sessionId

  const res = await fetch(url, { method, headers: finalHeaders, body: finalBody })

  if (res.status === 401 && allowRetry) {
    let code = null
    try {
      code = (await res.clone().json())?.code
    } catch {
      // not JSON — nothing to check, fall through to normal error handling
    }
    if (code === 'ENC_SESSION_EXPIRED') {
      // Server process restarted (or this session outlived its 24h TTL) —
      // its in-memory session map no longer knows this id. Re-handshake
      // once and replay the original request with a fresh key, rather than
      // surfacing a confusing failure the user can only fix by reloading.
      invalidateSession(resolvedBaseUrl)
      return doRequest(method, path, options, false)
    }
  }

  return parseResponse(res, resolvedBaseUrl)
}

export function apiRequest(method, path, options = {}) {
  return doRequest(method, path, options, true)
}

export async function apiGet(path, options = {}) {
  return apiRequest('GET', path, options)
}

export async function apiPost(path, body, options = {}) {
  // Preserves an existing quirk some callers rely on (e.g.
  // services/auth.js's deleteAccount): passing options.method overrides
  // the 'POST' default, so this doubles as the generic "POST unless told
  // otherwise" verb.
  return apiRequest(options.method || 'POST', path, { ...options, body })
}

export async function apiPatch(path, body, options = {}) {
  return apiRequest('PATCH', path, { ...options, body })
}

export async function apiPut(path, body, options = {}) {
  return apiRequest('PUT', path, { ...options, body })
}

export async function apiDelete(path, options = {}) {
  return apiRequest('DELETE', path, options)
}

export function getStoredToken() {
  try {
    return localStorage.getItem('swastha_token') || sessionStorage.getItem('swastha_token') || null;
  } catch {
    return null;
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('swastha_user') || sessionStorage.getItem('swastha_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAuthHeader(token) {
  const t = token || getStoredToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
}

export default {
  apiGet, apiPost, apiPatch, apiPut, apiDelete, apiRequest,
  getStoredToken, getStoredUser, getAuthHeader, BASE_URL,
}
