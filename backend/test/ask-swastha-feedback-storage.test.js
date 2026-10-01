// Part 3 of the feedback feature: POST /rag/api/search/feedback stores a
// rating scoped to the CALLER's own JWT identity, and never stores question
// or answer text. Mocks backend/config/supabase.js (the default-export
// client db/askSwasthaFeedback.js actually uses) to capture the exact
// insert payload.
import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// rag/config/env.js validates required env vars and exits at import time if
// missing — load .env directly before importing app.js, which would
// otherwise eagerly load the real config/supabase.js before the mock below
// is registered.
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const insertedRows = [];

mock.module(new URL('../config/supabase.js', import.meta.url).href, {
  defaultExport: {
    from: (table) => ({
      insert: async (row) => {
        insertedRows.push({ table, row });
        return { error: null };
      },
    }),
  },
});

const { default: app } = await import('../app.js');

const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

function signToken(userId) {
  return jwt.sign({ userId, email: `${userId}@example.com`, role: 'doctor' }, JWT_SECRET, { expiresIn: '1h' });
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
// forever. Registered BEFORE the test() calls, not inside the last one —
// exiting synchronously inside a test can race the test runner's own TAP
// output for that test still being flushed to stdout, silently dropping it
// from the report (see ai-notice-ack.test.js for the same issue/fix).
after(() => {
  mock.reset();
  setImmediate(() => process.exit(0));
});

test('a thumbs-up submission is stored, scoped to the caller from the JWT', async () => {
  insertedRows.length = 0;
  const userId = `usr_feedbackstore_${Date.now()}`;
  const token = signToken(userId);

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        rating: 'up',
        mode: 'retrieval',
        source_report_ids: ['r1', 'r2'],
      }),
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.stored, true);
  });

  assert.equal(insertedRows.length, 1);
  const { table, row } = insertedRows[0];
  assert.equal(table, 'ask_swastha_feedback');
  // user_id comes from the JWT, never from the request body — proves a
  // caller cannot attribute a row to a different user_id than their own.
  assert.equal(row.user_id, userId);
  assert.equal(row.rating, 'up');
  assert.equal(row.mode, 'retrieval');
  assert.deepEqual(row.source_report_ids, ['r1', 'r2']);
  assert.equal(row.degraded, false);
});

test('a body-supplied user_id is ignored — the row is always attributed to the caller', async () => {
  insertedRows.length = 0;
  const callerId = `usr_realcaller_${Date.now()}`;
  const impersonatedId = `usr_impersonated_${Date.now()}`;
  const token = signToken(callerId);

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      // user_id is not part of this endpoint's documented body shape at
      // all — sending one anyway must have no effect.
      body: JSON.stringify({ rating: 'down', user_id: impersonatedId }),
    });
    assert.equal(res.status, 200);
  });

  assert.equal(insertedRows.length, 1);
  assert.equal(insertedRows[0].row.user_id, callerId);
  assert.notEqual(insertedRows[0].row.user_id, impersonatedId);
});

test('an invalid rating is rejected with 400 and never reaches storage', async () => {
  insertedRows.length = 0;
  const token = signToken(`usr_badrating_${Date.now()}`);

  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/rag/api/search/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rating: 'sideways' }),
    });
    assert.equal(res.status, 400);
  });

  assert.equal(insertedRows.length, 0);
});

test('no question or answer text field exists anywhere in the stored row', async () => {
  insertedRows.length = 0;
  const token = signToken(`usr_notext_${Date.now()}`);

  await withServer(async (baseUrl) => {
    // Even if a client tried to sneak question/answer text into the body,
    // the route only ever reads rating/mode/source_report_ids/degraded —
    // nothing else it might send reaches the stored row.
    const res = await fetch(`${baseUrl}/rag/api/search/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        rating: 'down',
        mode: 'aggregate',
        question: 'Does this patient have a history of depression?',
        answer: 'Yes, diagnosed in 2024.',
      }),
    });
    assert.equal(res.status, 200);
  });

  assert.equal(insertedRows.length, 1);
  const row = insertedRows[0].row;
  assert.deepEqual(
    Object.keys(row).sort(),
    ['created_at', 'degraded', 'mode', 'rating', 'source_report_ids', 'user_id'].sort()
  );
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes('depression'), 'no question/answer text must appear in the stored row');
});
