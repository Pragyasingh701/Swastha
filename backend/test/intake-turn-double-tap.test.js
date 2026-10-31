// Two intake answers sent for one session at the same moment (a double tap, or a retry sent while
// the first try is still running) used to both start from the same transcript, so the second save
// replaced the first and an answer was lost. Now one answer is processed at a time per session.
// Runs the real route and dialogue code; only the AI provider is replaced, so it can be held up.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { startTestApp } from './helpers/testApp.js';

const db = createFakeSupabase();
const app = await startTestApp(db);
const { emptyStructuredHistory } = await import('../rag/services/intakeService.js');
after(() => app.close());

const patient = { id: 'usr_patient', email: 'asha@example.test' };
const stranger = { id: 'usr_stranger', email: 'other@example.test' };
const tokenFor = (user) => jwt.sign({ userId: user.id, email: user.email, role: 'patient' }, process.env.JWT_SECRET);

const aiReply = {
  next_question: 'How long have you had it?',
  updated_fields: {},
  section_complete: false,
  red_flag: false,
  red_flag_reason: null,
  quick_reply_options: { options: [], allow_multiple: false },
};
const geminiOk = () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(aiReply) }] }, finishReason: 'STOP' }] }),
});

// While `hold` is set, every AI call waits for it; `entered` says when the first one has arrived.
let hold = null;
let aiCallCount = 0;
let failAi = false;
let signalEntered;
let entered;
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  if (!String(url).includes('generativelanguage.googleapis.com')) return realFetch(url, init);
  aiCallCount += 1;
  signalEntered?.();
  if (hold) await hold.promise;
  return failAi ? { ok: false, status: 500, text: async () => 'down' } : geminiOk();
};
after(() => { global.fetch = realFetch; });

function holdAi() {
  let release;
  hold = { promise: new Promise((resolve) => { release = resolve; }) };
  entered = new Promise((resolve) => { signalEntered = resolve; });
  return () => { hold = null; release(); };
}

const turn = (message, user = patient) =>
  app.api('POST', '/rag/api/intake/turn', { token: tokenFor(user), body: { session_id: 'sess-1', message, skip_audio: true } });
// A refused request answers at once. Without the fix it would wait behind the held AI call, so give
// it a moment and fail the test instead of waiting forever.
const answersAtOnce = (request) => Promise.race([
  request,
  new Promise((_, reject) => setTimeout(() => reject(new Error('the extra answer was not refused, it is waiting on the first')), 1500).unref()),
]);
const transcript = () => db.rows('intake_sessions')[0].turns.map((t) => `${t.role}: ${t.text}`);

beforeEach(() => {
  db.clear();
  hold = null;
  failAi = false;
  aiCallCount = 0;
  db.insert('intake_sessions', {
    id: 'sess-1', patient_id: patient.id, status: 'in_progress', language: 'en-IN',
    structured_history: emptyStructuredHistory(), turns: [], priority: 'routine',
  });
});

test('a second answer sent while the first is still processing is refused, and nothing is lost', async () => {
  const release = holdAi();
  try {
    const first = turn('I have a fever');
    await entered;

    const duplicate = await answersAtOnce(turn('I have a fever'));
    const different = await answersAtOnce(turn('And a cough'));
    assert.equal(duplicate.status, 409);
    assert.equal(different.status, 409);
    assert.equal(aiCallCount, 1, 'the refused answers never reached the AI');

    release();
    const done = await first;
    assert.equal(done.status, 200);
    assert.deepEqual(transcript(), ['patient: I have a fever', 'assistant: How long have you had it?']);
  } finally {
    release(); // never leave a held AI call behind, even when an assertion fails
  }
});

test('once the first answer is done, the next one goes through and is added after it', async () => {
  assert.equal((await turn('I have a fever')).status, 200);
  assert.equal((await turn('Three days')).status, 200);
  assert.deepEqual(transcript().filter((line) => line.startsWith('patient')), ['patient: I have a fever', 'patient: Three days']);
});

test('a turn that fails does not leave the session stuck: the same answer can be sent again', async () => {
  failAi = true;
  assert.equal((await turn('I have a fever')).status, 503);
  failAi = false;
  assert.equal((await turn('I have a fever')).status, 200);
  assert.equal(transcript().length, 2);
});

test('someone else\'s request for the session is refused as not theirs, and does not disturb the owner\'s turn', async () => {
  const release = holdAi();
  const first = turn('I have a fever');
  await entered;

  const intruder = await turn('hello', stranger);
  assert.equal(intruder.status, 403);

  release();
  assert.equal((await first).status, 200);
  assert.equal(transcript().length, 2);
});

test('the owner is not held up by someone else\'s earlier request', async () => {
  // The stranger's request ends in a refusal, which must not leave the owner locked out.
  assert.equal((await turn('hello', stranger)).status, 403);
  assert.equal((await turn('I have a fever')).status, 200);
});
