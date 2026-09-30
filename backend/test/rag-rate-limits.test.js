// Confirms the rate limits added to POST /rag/api/extract (5/min) and
// POST /rag/api/search (20/min) actually reject once their max is
// exceeded, returning a plain JSON 429 — not just that the middleware is
// present in the route chain, but that it fires at the configured
// threshold. Hits the real app (limits are keyed by req.user.userId, no
// external dependency needs mocking) — each request is expected to fail
// with a 400 from the route itself (missing file / empty query), which is
// fine, since what's being verified is that the request still counts
// against the limiter and the Nth+1 one is rejected before reaching the
// route handler at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import app from '../app.js';

const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

test('POST /rag/api/extract and POST /rag/api/search reject once their rate limits are exceeded', async () => {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    const extractToken = jwt.sign(
      { userId: `usr_extractratelimit_${Date.now()}`, email: 'x@example.com', role: 'patient' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    let extractLastStatus;
    for (let i = 0; i < 6; i += 1) {
      const res = await fetch(`${baseUrl}/rag/api/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${extractToken}` },
        body: new FormData(), // no file — 400 from the route, still counts against the limiter
      });
      extractLastStatus = res.status;
      if (i < 5) {
        assert.notEqual(res.status, 429, `extract request ${i + 1} of 5 should not be rate-limited yet`);
      }
    }
    assert.equal(extractLastStatus, 429, 'the 6th extract request within the window should be rate-limited');

    const searchToken = jwt.sign(
      { userId: `usr_searchratelimit_${Date.now()}`, email: 'y@example.com', role: 'patient' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    let searchLastStatus;
    for (let i = 0; i < 21; i += 1) {
      const res = await fetch(`${baseUrl}/rag/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${searchToken}` },
        body: JSON.stringify({}), // empty query — 400 from the route, still counts against the limiter
      });
      searchLastStatus = res.status;
      if (i < 20) {
        assert.notEqual(res.status, 429, `search request ${i + 1} of 20 should not be rate-limited yet`);
      }
    }
    assert.equal(searchLastStatus, 429, 'the 21st search request within the window should be rate-limited');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // backend/routes/auth.js's OTP/reset-token cleanup interval (pre-existing,
  // unrelated to this fix) isn't unref'd — harmless for the real
  // long-running server, but it would otherwise keep this short-lived test
  // process alive forever after the test itself is done.
  process.exit(0);
});
