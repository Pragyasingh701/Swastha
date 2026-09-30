// Fix: backend/routes/reports.js's resolveTargetUser must return 500 when
// isDoctorLinkedToPatient throws a genuine DB/network error, keeping 403
// only for a doctor who is genuinely unlinked or whose access has expired
// (isDoctorLinkedToPatient resolving to false, not throwing).
//
// Uses node:test's mock.module to force isDoctorLinkedToPatient to throw,
// without depending on a real Supabase outage. Kept in its own file with
// NO static import of app.js: mock.module only intercepts a module's first
// load, and app.js transitively loads the real backend/db/doctorPatients.js
// before this file's body would otherwise run.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

test('POST /api/reports returns 500 (not 403) when the doctor-patient link check itself fails', async () => {
  // Other route files import other exports from this same module (e.g.
  // acceptDoctorLinkRequest), so the mock spreads the real module's
  // exports and overrides only isDoctorLinkedToPatient.
  const realDoctorPatientsModule = await import(new URL('../db/doctorPatients.js', import.meta.url).href);
  mock.module(new URL('../db/doctorPatients.js', import.meta.url).href, {
    namedExports: {
      ...realDoctorPatientsModule,
      isDoctorLinkedToPatient: async () => {
        throw new Error('simulated Supabase outage');
      },
    },
  });
  // findUserById is called first, to resolve the requested userId into a
  // target user object — must resolve to something with a different id
  // than the caller so resolveTargetUser's doctor branch (and therefore
  // the mocked isDoctorLinkedToPatient) is actually reached. Other parts
  // of the app import other exports from this same module (e.g.
  // createOrUpdateUser), so the mock spreads the real module's exports
  // and overrides only the two used by resolveTargetUser.
  const realUsersModule = await import(new URL('../db/users.js', import.meta.url).href);
  mock.module(new URL('../db/users.js', import.meta.url).href, {
    namedExports: {
      ...realUsersModule,
      findUserById: async (id) => ({ id, email: 'target-patient@example.com', role: 'patient' }),
      findUserByEmail: async () => null,
    },
  });

  const { default: app } = await import('../app.js');

  // Read AFTER app.js has run (it calls dotenv.config() before its own
  // JWT_SECRET constants evaluate) — resolving this at module-top-level
  // would read process.env.JWT_SECRET before .env is loaded, silently
  // falling back to the dev-default secret while the app itself ends up
  // using the real one, signing a token the app's own jwt.verify rejects.
  const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

  const doctorId = `doc_targeterrtest_${Date.now()}`;
  const targetPatientId = `usr_targeterrtest_${Date.now()}`;
  const token = jwt.sign({ userId: doctorId, email: 'doc@example.com', role: 'doctor' }, JWT_SECRET, {
    expiresIn: '1h',
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    const res = await fetch(`${baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        userId: targetPatientId,
        title: 'Test Report',
        category: 'Consultation',
        reportDate: '2026-01-01',
      }),
    });
    const data = await res.json();

    assert.equal(res.status, 500);
    assert.equal(data.message, 'Could not verify patient access. Please try again.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    mock.reset();
  }

  // backend/routes/auth.js's OTP/reset-token cleanup interval (pre-existing,
  // unrelated to this fix) isn't unref'd — harmless for the real
  // long-running server, but it would otherwise keep this short-lived test
  // process alive forever after the test itself is done (same reasoning as
  // wire-encryption.test.js's own after() hook).
  process.exit(0);
});
