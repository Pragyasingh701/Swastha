// Boots the real Express app (backend/app.js, every route and middleware) against an
// in-memory database and a recording mailer, and returns a small HTTP client.
//
// Call it ONCE per test file, at the top level, before anything else imports the app:
// node:test cannot re-mock a module within one process, and each test file runs in its
// own process anyway.
//
//   const db = createFakeSupabase({ patients: [...] });
//   const app = await startTestApp(db);
//   const { status, body } = await app.api('POST', '/api/auth/login', { body: {...} });
//   app.mail.otps.at(-1).code      // the verification code "sent" by email
//   await app.close();             // in an after() hook
import { mock } from 'node:test';
import http from 'node:http';

const here = (relative) => new URL(relative, import.meta.url).href;

export async function startTestApp(db) {
  // Set unconditionally: a developer's backend/.env must never decide what these tests talk to.
  Object.assign(process.env, {
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    JWT_SECRET: 'test-jwt-secret-not-used-anywhere-else',
    OPENROUTER_API_KEY: 'test-key',
    ALLOW_OPENROUTER_FALLBACK: 'false',
    GEMINI_API_KEYS: 'test-key-1,test-key-2,test-key-3',
    RATE_LIMIT_DISABLED: 'true',
    BACKEND_URL: 'http://backend.test',
    INTAKE_SWEEP_SECRET: 'sweep-secret-for-tests',
  });
  delete process.env.SESSION_TOKEN_TTL;
  delete process.env.REMEMBER_ME_TOKEN_TTL;

  mock.module(here('../../config/supabase.js'), { defaultExport: db.client });
  mock.module(here('../../rag/config/supabase.js'), { namedExports: { supabase: db.client } });

  const mail = { otps: [], resets: [], accountExists: [], doctorRequests: [] };
  const realMailer = await import(here('../../utils/mailer.js'));
  mock.module(here('../../utils/mailer.js'), {
    namedExports: {
      ...realMailer,
      sendOTPEmail: async (to, code) => { mail.otps.push({ to, code }); },
      sendPasswordResetEmail: async (to, token) => { mail.resets.push({ to, token }); },
      sendAccountExistsEmail: async (to) => { mail.accountExists.push({ to }); },
      sendDoctorRequestEmail: async (to, doctorName, acceptUrl, declineUrl) => {
        mail.doctorRequests.push({ to, doctorName, acceptUrl, declineUrl });
      },
    },
  });

  const { default: app } = await import('../../app.js');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, { token, body, headers = {}, form } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.authorization = `Bearer ${token}`;
    if (form) {
      init.headers['content-type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(form).toString();
    } else if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${path}`, init);
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: response.status, body: parsed };
  }

  return {
    api,
    mail,
    base,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
