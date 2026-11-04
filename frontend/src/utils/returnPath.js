// Remembers the page a signed-out visitor was trying to reach, so signing in lands them there
// instead of on the dashboard. It is kept in this tab's sessionStorage rather than in the router
// state, because the way back from sign-in can pass through the code screen or a full-page
// redirect to Google, and neither carries router state.
const KEY = "swastha_return_path";
const MAX_AGE_MS = 30 * 60 * 1000;

// Only these pages can be returned to. Anything else (another site, a sign-in page, a stray
// value in storage) falls back to the dashboard, so this can never be used as an open redirect.
const PATIENT_PATHS = ["/dashboard", "/vault", "/family-vault", "/timeline", "/lab-trends", "/search", "/intake"];
const DOCTOR_PATHS = ["/doctor-dashboard", "/doctor/intake-queue", "/doctor/patients", "/doctor/clinical-intelligence", "/doctor/ask-swastha"];

function allowedPaths(role) {
  if (role === "doctor") return DOCTOR_PATHS;
  if (role === "patient") return PATIENT_PATHS;
  return [];
}

// Signing out on purpose is not "being sent to sign in from a page": the page just left must
// not become the landing page of the next sign-in. logout() calls this, and the redirect to the
// sign-in page that follows (a moment later) is then not remembered.
let loggedOutAt = 0;
const LOGOUT_WINDOW_MS = 2000;

export function skipNextReturnPath() {
  loggedOutAt = Date.now();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

export function rememberReturnPath(location) {
  if (Date.now() - loggedOutAt < LOGOUT_WINDOW_MS) return;
  try {
    const path = `${location.pathname}${location.search || ""}${location.hash || ""}`;
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* storage unavailable: sign-in simply lands on the dashboard */
  }
}

// The remembered page if this role may open it, else null. Always forgets it, so it applies once.
export function takeReturnPath(role) {
  let stored = null;
  try {
    stored = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!stored || typeof stored.path !== "string" || Date.now() - Number(stored.at) > MAX_AGE_MS) return null;
  const pathname = stored.path.split(/[?#]/)[0];
  return allowedPaths(role).includes(pathname) ? stored.path : null;
}

// Where to send someone who has just signed in.
export function postLoginRoute(user) {
  const role = String(user?.role || "").trim().toLowerCase() === "doctor" ? "doctor" : "patient";
  return takeReturnPath(role) || (role === "doctor" ? "/doctor-dashboard" : "/dashboard");
}
