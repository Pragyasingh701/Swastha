// Part 2 of the audit-log feature: an insert failure in
// backend/db/askSwasthaAccessLog.js's logAccess must never throw (writes
// are best-effort) and must never break the caller's own response. Split
// into its own file because it needs the REAL logAccess module (mocking
// only the Supabase client underneath it) — the other audit-log tests
// (ask-swastha-access-log.test.js) mock logAccess itself wholesale, and
// mock.module can't re-mock an already-mocked specifier within one process.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// rag/config/env.js (imported transitively once app.js loads) validates
// required env vars and exits at import time if missing — load .env
// directly, without going through app.js first (which would also eagerly
// load the real config/supabase.js before the mock below is registered).
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

// backend/config/supabase.js (default export) is what
// db/askSwasthaAccessLog.js actually imports — NOT the rag sub-app's named-
// export client (backend/rag/config/supabase.js). Its insert() call always
// fails, so this exercises logAccess's real catch-and-log path rather than
// a mocked stand-in for it.
mock.module(new URL('../config/supabase.js', import.meta.url).href, {
  defaultExport: {
    from: () => ({
      insert: async () => ({ error: { message: 'simulated Supabase outage', code: '500' } }),
    }),
  },
});

test("logAccess resolves without throwing when the insert fails (doesn't break the caller)", async () => {
  const { logAccess } = await import('../db/askSwasthaAccessLog.js');

  // No try/catch here on purpose — if logAccess ever throws on a DB error,
  // this test fails simply by the promise rejecting, proving the "never
  // fails the underlying request" contract holds for its real
  // implementation, not just for a test mock's approximation of it.
  await logAccess({
    callerUserId: 'usr_a',
    targetPatientId: 'usr_a',
    isCrossPatient: false,
    route: 'search',
    mode: 'retrieval',
    resultCount: 1,
    degraded: false,
  });

  mock.reset();
});

test('the search route still returns 200 even when the audit-log write fails', async () => {
  // requireNoticeAck (Part 1) checks db/aiNoticeAcknowledgements.js, which
  // also goes through backend/config/supabase.js in principle — but the rag
  // sub-app's acknowledgement check actually uses this same default-export
  // client (see db/aiNoticeAcknowledgements.js), so it would ALSO see the
  // simulated outage and 500 before ever reaching logAccess. Pre-acknowledge
  // via a separate mock of that module specifically, so this test isolates
  // the audit-log failure from the unrelated notice-ack gate.
  mock.module(new URL('../db/aiNoticeAcknowledgements.js', import.meta.url).href, {
    namedExports: {
      hasAcknowledged: async () => true,
      recordAcknowledgement: async () => {},
      checkNoticeAck: async () => ({ ok: true }),
    },
  });

  // conversationalSearchService.js imports several OTHER exports from this
  // same module (MATCH_COUNT, buildGroundedPrompt, etc.) — spread the real
  // module and override only searchReports, same pattern used throughout
  // this test suite for narrowly-scoped module mocks.
  const realSearchServiceModule = await import(new URL('../rag/services/searchService.js', import.meta.url).href);
  mock.module(new URL('../rag/services/searchService.js', import.meta.url).href, {
    namedExports: {
      ...realSearchServiceModule,
      searchReports: async () => ({
        answer: 'Mock answer.',
        structured: { headline: 'Mock answer.', keyFacts: [], caveat: '' },
        sources: [{ report_id: 'r1' }],
        noResultsFound: false,
        mode: 'retrieval',
      }),
    },
  });

  const { default: app } = await import('../app.js');
  const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';
  const userId = `usr_logfails_${Date.now()}`;
  const token = jwt.sign({ userId, email: `${userId}@example.com`, role: 'patient' }, JWT_SECRET, { expiresIn: '1h' });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    const res = await fetch(`${baseUrl}/rag/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: 'What are my allergies?' }),
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.answer, 'Mock answer.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    mock.reset();
    // setImmediate, not a bare process.exit(0): exiting synchronously here
    // can race the test runner's own TAP output for this test still being
    // flushed to stdout, silently dropping it from the report (same issue
    // documented in ai-notice-ack.test.js). Deferring one tick lets that
    // flush finish first.
    setImmediate(() => process.exit(0));
  }
});
