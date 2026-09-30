// Part 3 of the feedback feature: POST /rag/api/search/feedback requires
// auth and is rate-limited, same pattern as rag-rate-limits.test.js — hits
// the real app (no mocking needed, since an invalid rating triggers a 400
// from the route itself before any DB call, and a missing/invalid rating
// still counts against the limiter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import app from '../app.js';

const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

test('POST /rag/api/search/feedback requires auth and rejects once its rate limit is exceeded', async () => {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    // No Authorization header at all.
    const unauthedRes = await fetch(`${baseUrl}/rag/api/search/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 'up' }),
    });
    assert.equal(unauthedRes.status, 401);

    const token = jwt.sign(
      { userId: `usr_feedbackratelimit_${Date.now()}`, email: 'z@example.com', role: 'patient' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // FEEDBACK_RATE_LIMIT_MAX defaults to 30. An invalid rating 400s from
    // the route before any DB call, but still counts against the limiter —
    // same technique rag-rate-limits.test.js uses for extract/search.
    let lastStatus;
    for (let i = 0; i < 31; i += 1) {
      const res = await fetch(`${baseUrl}/rag/api/search/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: 'not-a-real-rating' }),
      });
      lastStatus = res.status;
      if (i < 30) {
        assert.notEqual(res.status, 429, `feedback request ${i + 1} of 30 should not be rate-limited yet`);
      }
    }
    assert.equal(lastStatus, 429, 'the 31st feedback request within the window should be rate-limited');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // backend/routes/auth.js's OTP/reset-token cleanup interval (pre-existing,
  // unrelated to this feature) isn't unref'd — harmless for the real
  // long-running server, but it would otherwise keep this short-lived test
  // process alive forever after the test itself is done.
  process.exit(0);
});
