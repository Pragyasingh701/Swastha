// `fetch` that gives up after `timeoutMs`. Node's fetch waits forever by default, so one
// provider that stops answering (the email service, Google, the AI route) would leave the
// request that called it hanging, and with it the person waiting on screen. On timeout the
// promise rejects with a TimeoutError, which the callers' existing catch blocks already
// treat like any other failed call.
export function fetchWithTimeout(url, init = {}, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(url, { ...init, signal });
}

// How long each kind of call may take.
export const TIMEOUTS = {
  email: 10_000, // Brevo
  google: 10_000, // token exchange and ID-token check
  internalAi: 90_000, // our own AI routes: a model ladder, up to ~30s per attempt
};
