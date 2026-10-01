// Part 2 of the audit-log feature: POST /rag/api/search/chat and POST
// /rag/api/search each write one row to ask_swastha_access_log at the end
// of the request (backend/db/askSwasthaAccessLog.js's logAccess) — who
// accessed which patient's records, never the question/answer text.
//
// mock.module can't re-mock an already-mocked specifier within one process,
// so every test in this file shares ONE mocked set of dependencies and ONE
// real app.js, imported once at module scope. Each test captures logAccess
// calls into the shared `loggedCalls` array (cleared per test) rather than
// re-mocking.
import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const loggedCalls = [];

mock.module(new URL('../db/askSwasthaAccessLog.js', import.meta.url).href, {
  namedExports: {
    logAccess: async (entry) => {
      loggedCalls.push(entry);
    },
  },
});

// Notice-ack gate (Part 1) is unrelated to this feature — pre-acknowledged
// for every caller so these tests exercise the audit log, not the ack gate.
// checkNoticeAck is also mocked here since routes/clinic.js (loaded
// transitively via app.js) now imports it from this same module.
mock.module(new URL('../db/aiNoticeAcknowledgements.js', import.meta.url).href, {
  namedExports: {
    hasAcknowledged: async () => true,
    recordAcknowledgement: async () => {},
    checkNoticeAck: async () => ({ ok: true }),
  },
});

// A magic patient id that simulates isDoctorLinkedToPatient resolving to
// false (unlinked) — every other target id is treated as linked.
const UNLINKED_PATIENT_ID = '__UNLINKED_PATIENT__';

// Other parts of the app import other exports from this same module (e.g.
// acceptDoctorLinkRequest, used by backend/routes/doctorPatients.js, which
// app.js loads transitively) — spread the real module's exports and
// override only isDoctorLinkedToPatient, same pattern as
// reports-target-user-error.test.js.
const realDoctorPatientsModule = await import(new URL('../db/doctorPatients.js', import.meta.url).href);
mock.module(new URL('../db/doctorPatients.js', import.meta.url).href, {
  namedExports: {
    ...realDoctorPatientsModule,
    isDoctorLinkedToPatient: async (doctorId, patientUserId) => patientUserId !== UNLINKED_PATIENT_ID,
  },
});

// conversationalSearchService/searchService are mocked directly at the
// service layer — this file tests the ROUTE's logging behaviour, not
// retrieval/generation itself (already covered by the ask-swastha-*.test.js
// files). A magic query string ('__DEGRADED__') simulates a degraded
// (provider-exhausted) result to exercise that logging branch too.
mock.module(new URL('../rag/services/conversationalSearchService.js', import.meta.url).href, {
  namedExports: {
    conversationalSearch: async ({ query, sessionId }) => {
      if (query === '__DEGRADED__') {
        return {
          answer: 'fallback', structured: { headline: 'fallback', keyFacts: [], caveat: '' },
          sources: [], noResultsFound: false, degraded: true, mode: 'retrieval', sessionId,
        };
      }
      return {
        answer: 'Mock answer.',
        structured: { headline: 'Mock answer.', keyFacts: [], caveat: '' },
        sources: [{ report_id: 'r1' }, { report_id: 'r2' }],
        noResultsFound: false,
        mode: 'retrieval',
        sessionId,
      };
    },
  },
});

mock.module(new URL('../rag/services/searchService.js', import.meta.url).href, {
  namedExports: {
    searchReports: async (query, userId) => ({
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

function signToken(userId, role = 'patient') {
  return jwt.sign({ userId, email: `${userId}@example.com`, role }, JWT_SECRET, { expiresIn: '1h' });
}

async function withServer(fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

after(() => {
  mock.reset();
  setImmediate(() => process.exit(0));
});

test('a doctor searching a linked patient writes is_cross_patient=true', async () => {
  loggedCalls.length = 0;
  const doctorId = `doc_crosspatient_${Date.now()}`;
  const patientId = `usr_crosspatient_${Date.now()}`;
  const token = signToken(doctorId, 'doctor');

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: 'What are their allergies?',
        session_id: 'sess-crosspatient-12345',
        patient_user_id: patientId,
      }),
    });
    assert.equal(res.status, 200);
  });

  assert.equal(loggedCalls.length, 1);
  const entry = loggedCalls[0];
  assert.equal(entry.callerUserId, doctorId);
  assert.equal(entry.targetPatientId, patientId);
  assert.equal(entry.isCrossPatient, true);
  assert.equal(entry.route, 'search_chat');
  assert.equal(entry.mode, 'retrieval');
  assert.equal(entry.resultCount, 2);
  assert.equal(entry.degraded, false);
});

test('a patient searching their own records writes is_cross_patient=false', async () => {
  loggedCalls.length = 0;
  const patientId = `usr_ownrecords_${Date.now()}`;
  const token = signToken(patientId, 'patient');

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: 'What are my allergies?' }),
    });
    assert.equal(res.status, 200);
  });

  assert.equal(loggedCalls.length, 1);
  const entry = loggedCalls[0];
  assert.equal(entry.callerUserId, patientId);
  assert.equal(entry.targetPatientId, patientId);
  assert.equal(entry.isCrossPatient, false);
  assert.equal(entry.route, 'search');
});

test('a 403 for an unlinked patient still writes a row, with result_count null', async () => {
  loggedCalls.length = 0;
  const doctorId = `doc_unlinked_${Date.now()}`;
  const token = signToken(doctorId, 'doctor');

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: 'What are their allergies?',
        session_id: 'sess-unlinked-123456',
        patient_user_id: UNLINKED_PATIENT_ID,
      }),
    });
    assert.equal(res.status, 403);
  });

  assert.equal(loggedCalls.length, 1);
  const entry = loggedCalls[0];
  assert.equal(entry.callerUserId, doctorId);
  assert.equal(entry.targetPatientId, UNLINKED_PATIENT_ID);
  assert.equal(entry.isCrossPatient, true);
  assert.equal(entry.route, 'search_chat');
  assert.equal(entry.mode, null);
  assert.equal(entry.resultCount, null);
});

test('no query text is stored in the logged row', async () => {
  loggedCalls.length = 0;
  const patientId = `usr_notext_${Date.now()}`;
  const token = signToken(patientId, 'patient');
  const sensitiveQuery = 'Do I have HIV or any other STI documented in my records?';

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: sensitiveQuery, session_id: 'sess-notext-123456789' }),
    });
    assert.equal(res.status, 200);
  });

  assert.equal(loggedCalls.length, 1);
  const entry = loggedCalls[0];
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('HIV'), 'the logged entry must not contain any part of the query text');
  assert.ok(!serialized.includes(sensitiveQuery), 'the logged entry must not contain the raw query string');
  // Only the expected fields — no stray "query"/"answer"/"excerpt" key was
  // accidentally added to the call.
  assert.deepEqual(
    Object.keys(entry).sort(),
    ['callerUserId', 'degraded', 'isCrossPatient', 'mode', 'resultCount', 'route', 'targetPatientId'].sort()
  );
});
