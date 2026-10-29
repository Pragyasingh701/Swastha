// POST /api/intake-admin/sweep-abandoned: the machine-to-machine trigger that marks intake
// sessions nobody finished as abandoned. It is protected by a shared secret, not a login,
// so the secret check is what keeps the public from running it.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { startTestApp } from './helpers/testApp.js';

const db = createFakeSupabase();
const app = await startTestApp(db);
after(() => app.close());

const HOUR = 60 * 60 * 1000;
const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR).toISOString();
const sweep = (secret) => app.api('POST', '/api/intake-admin/sweep-abandoned', {
  headers: secret === undefined ? {} : { 'x-sweep-secret': secret },
});
const statusOf = (id) => db.rows('intake_sessions').find((s) => s.id === id).status;

beforeEach(() => {
  db.clear();
  db.insert('intake_sessions', { id: 'stale', patient_id: 'p1', status: 'in_progress', created_at: hoursAgo(49) });
  db.insert('intake_sessions', { id: 'recent', patient_id: 'p1', status: 'in_progress', created_at: hoursAgo(2) });
  db.insert('intake_sessions', { id: 'done', patient_id: 'p1', status: 'completed', created_at: hoursAgo(500) });
  process.env.INTAKE_SWEEP_SECRET = 'sweep-secret-for-tests';
});

test('without the secret, or with a wrong one, nothing is swept', async () => {
  assert.equal((await sweep()).status, 401);
  assert.equal((await sweep('wrong')).status, 401);
  assert.equal((await sweep('SWEEP-SECRET-FOR-TESTS')).status, 401);
  assert.equal(statusOf('stale'), 'in_progress');
});

test('if no secret is configured the endpoint refuses everything, even an empty header', async () => {
  delete process.env.INTAKE_SWEEP_SECRET;
  assert.equal((await sweep()).status, 503);
  assert.equal((await sweep('')).status, 503);
  assert.equal((await sweep('undefined')).status, 503);
  assert.equal(statusOf('stale'), 'in_progress');
});

test('the right secret marks only sessions untouched for over 48 hours as abandoned', async () => {
  const { status, body } = await sweep('sweep-secret-for-tests');
  assert.equal(status, 200);
  assert.equal(body.abandonedCount, 1);
  assert.deepEqual(body.abandonedIds, ['stale']);
  assert.equal(statusOf('stale'), 'abandoned');
  assert.equal(statusOf('recent'), 'in_progress');
  assert.equal(statusOf('done'), 'completed');
  assert.ok(db.rows('intake_sessions').find((s) => s.id === 'stale').abandoned_at);
});

test('running it again finds nothing new', async () => {
  await sweep('sweep-secret-for-tests');
  const again = await sweep('sweep-secret-for-tests');
  assert.equal(again.body.abandonedCount, 0);
});

test('a database failure is a clean 500, not a crash', async () => {
  db.failNext('intake_sessions', 'update');
  assert.equal((await sweep('sweep-secret-for-tests')).status, 500);
  assert.equal(statusOf('stale'), 'in_progress');
});
