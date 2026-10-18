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
// The backend answers 403 { code: 'AI_NOTICE_ACK_REQUIRED' } when an AI
// feature is used before the user has accepted how Swastha uses AI. Rather than
// every caller handling that, it is announced once and a single global modal
// (components/common/AiNoticeGate.jsx) asks for the acknowledgement.
export const AI_NOTICE_REQUIRED_EVENT = 'swastha:ai-notice-required'

export function notifyAiNoticeRequired(feature) {
  try {
    window.dispatchEvent(new CustomEvent(AI_NOTICE_REQUIRED_EVENT, { detail: { feature: feature || 'ask_swastha' } }))
  } catch {
    // no window (tests/SSR) — nothing to notify
  }
}

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
    if (res.status === 403 && data?.code === 'AI_NOTICE_ACK_REQUIRED') {
      notifyAiNoticeRequired(data.feature)
    }
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

  // A 401 on a request that carried a token means the session is no longer
  // valid; announce it once so the app can sign out (see AuthContext.jsx).
  // Requests without a token (login, register, ...) legitimately 401 and are left alone.
  if (res.status === 401 && finalHeaders.Authorization) {
    try {
      window.dispatchEvent(new CustomEvent('swastha:session-expired'))
    } catch {
      // no window (tests/SSR)
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
  // api/auth.js's deleteAccount): passing options.method overrides
  // the 'POST' default, so this doubles as the generic "POST unless told
  // otherwise" verb.
  return apiRequest(options.method || 'POST', path, { ...options, body })
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

export default {
  apiGet, apiPost, apiRequest,
  getStoredToken, getAuthHeader, BASE_URL, notifyAiNoticeRequired,
}
