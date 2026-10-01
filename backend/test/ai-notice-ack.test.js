// Part 1 of the AI-processing disclosure feature: a one-time, server-side-
// enforced acknowledgement gate in front of Ask Swastha (POST
// /rag/api/search/chat). Voice intake (POST /rag/api/intake/start) USED to
// be gated the same way but had its consent requirement removed by product
// decision — see the "voice intake consent gate removed" test below, which
// now asserts the opposite of what it once did (no acknowledgement required
// at all for intake).
//
// mock.module can't re-mock an already-mocked specifier within one process,
// so every test in this file shares ONE mocked db/aiNoticeAcknowledgements.js
// (backed by the in-memory `ackStore` below) and ONE real app.js, imported
// once at module scope. Each test manipulates `ackStore`'s contents directly
// instead of re-mocking, which is what lets 6 different acknowledgement-state
// scenarios live in one file/process.
import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// In-memory stand-in for the ai_notice_acknowledgements table, keyed
// "userId:feature:version" -> true. Manipulated directly by each test
// instead of re-mocking (mock.module only takes effect on first load).
const ackStore = new Set();
function ackKey(userId, feature, version) {
  return `${userId}:${feature}:${version}`;
}

// A magic userId that simulates hasAcknowledged throwing a real DB error —
// lets the "lookup failure -> 500" test exercise that path without a
// separate mocked module registry (mock.module can't be re-registered for
// an already-mocked specifier within one process).
const SIMULATE_DB_FAILURE_USER_ID = '__SIMULATE_DB_FAILURE__';

// AI_NOTICE_VERSION is real (unmocked) — checkNoticeAck below mirrors the
// real module's own implementation (db/aiNoticeAcknowledgements.js) against
// this file's mocked hasAcknowledged/ackStore, since checkNoticeAck itself
// is also mocked here (routes/clinic.js, loaded transitively via app.js,
// now imports it from this same module).
const { AI_NOTICE_VERSION } = await import(new URL('../rag/config/aiNotices.js', import.meta.url).href);

async function mockedHasAcknowledged(userId, feature, version) {
  if (userId === SIMULATE_DB_FAILURE_USER_ID) {
    throw new Error('simulated Supabase outage');
  }
  return ackStore.has(ackKey(userId, feature, version));
}

mock.module(new URL('../db/aiNoticeAcknowledgements.js', import.meta.url).href, {
  namedExports: {
    hasAcknowledged: mockedHasAcknowledged,
    recordAcknowledgement: async (userId, feature, version) => {
      ackStore.add(ackKey(userId, feature, version));
    },
    checkNoticeAck: async (userId, feature) => {
      try {
        const acknowledged = await mockedHasAcknowledged(userId, feature, AI_NOTICE_VERSION);
        if (!acknowledged) {
          return { ok: false, status: 403, code: 'AI_NOTICE_ACK_REQUIRED', feature, noticeVersion: AI_NOTICE_VERSION };
        }
        return { ok: true };
      } catch {
        return { ok: false, status: 500 };
      }
    },
  },
});

// isDoctorLinkedToPatient is unused by these tests (no patient_user_id sent)
// but searchChat.js imports it at module load — a real (unmocked) import
// works fine here since it's never called with these test bodies.

// intakeService.js's startIntakeSession makes a real Supabase call this test
// must never reach — the ack gate itself should already reject an
// unacknowledged request before the route handler's own try block calls it.
// For the ACKNOWLEDGED case, mock it so this test doesn't need a live DB.
mock.module(new URL('../rag/services/intakeService.js', import.meta.url).href, {
  namedExports: {
    startIntakeSession: async (patientId) => ({
      session: { id: `sess_${patientId}` },
      turn: { next_question: 'What brings you in today?', quick_reply_options: null, section: 'chief_complaint', red_flag: false },
    }),
    advanceIntakeSession: async () => {
      throw new Error('unexpected call in this test');
    },
    finalizeIntakeSession: async () => {
      throw new Error('unexpected call in this test');
    },
  },
});

// ttsService.js's synthesizeSpeech is called by intake.js's withAudio()
// wrapper on every successful /start response — mocked to a no-audio
// no-op so this test doesn't depend on real Sarvam credentials/network.
mock.module(new URL('../rag/services/ttsService.js', import.meta.url).href, {
  namedExports: {
    synthesizeSpeech: async () => ({ ok: false }),
    buildOptionsSpeech: async () => ({ ok: false }),
    normalizeLanguage: (lang) => lang || 'hi-IN',
    DEFAULT_LANGUAGE: 'hi-IN',
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

// backend/routes/auth.js's OTP/reset-token cleanup interval (pre-existing,
// unrelated to this feature) isn't unref'd — harmless for the real
// long-running server, but it would otherwise keep this test process alive
// forever. Registered BEFORE the test() calls below, matching
// wire-encryption.test.js's own after() hook — node:test attaches a hook to
// the enclosing (root) scope based on where it's declared relative to
// sibling tests, and declaring it only after every test() call risks racing
// the last test's own async body since top-level tests are not awaited as
// they're declared.
after(() => {
  mock.reset();
  // setImmediate, not a bare process.exit(0): exiting synchronously here can
  // race the test runner's own TAP output for the last-completed test still
  // being flushed to stdout, silently dropping it from the report (observed
  // while writing this file — the 6th test's request visibly ran, per its
  // console.error, but never got an ok/not-ok line). Deferring one tick
  // lets that flush finish first.
  setImmediate(() => process.exit(0));
});

test('a missing acknowledgement blocks first use of Ask Swastha server-side (403)', async () => {
  const userId = `usr_noack_search_${Date.now()}`;
  const token = signToken(userId);

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: 'What are my allergies?', session_id: 'sess-noack-12345678' }),
    });
    const data = await res.json();

    assert.equal(res.status, 403);
    assert.equal(data.code, 'AI_NOTICE_ACK_REQUIRED');
    assert.equal(data.feature, 'ask_swastha');
  });
});

test('acknowledging Ask Swastha is stored and unblocks the next request', async () => {
  const userId = `usr_ack_search_${Date.now()}`;
  const token = signToken(userId);

  await withServer(async (baseUrl) => {
    // Not yet acknowledged.
    const before = await fetch(`${baseUrl}/rag/api/notices/ack/ask_swastha`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal((await before.json()).acknowledged, false);

    // Acknowledge.
    const ackRes = await fetch(`${baseUrl}/rag/api/notices/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feature: 'ask_swastha' }),
    });
    assert.equal(ackRes.status, 200);
    const ackData = await ackRes.json();
    assert.equal(ackData.acknowledged, true);

    // Now stored — status check reflects it.
    const after = await fetch(`${baseUrl}/rag/api/notices/ack/ask_swastha`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal((await after.json()).acknowledged, true);
  });
});

test('bumping the notice version re-prompts even a previously-acknowledged user', async () => {
  const userId = `usr_bump_${Date.now()}`;
  // Simulate having acknowledged an OLDER version directly in the store.
  ackStore.add(ackKey(userId, 'ask_swastha', 0));
  const token = signToken(userId);

  await withServer(async (baseUrl) => {
    // The real AI_NOTICE_VERSION (1) was never acknowledged by this user —
    // only the stale version 0 was — so this must still be blocked.
    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: 'Summarize my history.', session_id: 'sess-bump-123456789' }),
    });
    const data = await res.json();

    assert.equal(res.status, 403);
    assert.equal(data.code, 'AI_NOTICE_ACK_REQUIRED');
    assert.equal(data.notice_version, 1, 'must report the CURRENT version, not the stale one the user already has');
  });
});

test('POST /intake/start requires no AI-notice acknowledgement (voice intake consent gate removed)', async () => {
  const userId = `usr_noack_intake_${Date.now()}`;
  const token = signToken(userId);

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/intake/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ language: 'en-IN' }),
    });
    const data = await res.json();

    assert.equal(res.status, 200, 'voice intake must work with no acknowledgement on record at all');
    assert.ok(data.session_id);
  });
});

test('a lookup failure returns 500, not a silent allow', async () => {
  const userId = SIMULATE_DB_FAILURE_USER_ID;
  const token = signToken(userId);

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: 'Summarize my history.', session_id: 'sess-dbfail-123456' }),
    });
    const data = await res.json();

    assert.equal(res.status, 500);
    assert.notEqual(data.code, 'AI_NOTICE_ACK_REQUIRED');
  });
});
