const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '771272691038-s9h707grr3b4ojkgp48aa5vb9tej2sjh.apps.googleusercontent.com';
const OAUTH_CONTEXT_KEY = 'swastha_google_oauth_context';

export function getGoogleRedirectUri() {
  return `${window.location.origin}/auth/google/callback`;
}

// Redirect the whole page to Google's consent screen instead of opening a popup —
// ad blockers commonly block window.open()/OAuth popups, but a plain top-level
// navigation to accounts.google.com is effectively never blocked.
export function startGoogleAuth({ mode, role } = {}) {
  sessionStorage.setItem(OAUTH_CONTEXT_KEY, JSON.stringify({ mode, role }));

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function consumeGoogleOAuthContext() {
  const raw = sessionStorage.getItem(OAUTH_CONTEXT_KEY);
  sessionStorage.removeItem(OAUTH_CONTEXT_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
