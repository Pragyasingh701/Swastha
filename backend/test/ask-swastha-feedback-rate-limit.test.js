// Part 3 of the feedback feature: POST /rag/api/search/feedback requires
// auth. (This endpoint previously also had a rate limit — removed
// per-product-decision: healthcare access matters more than AI provider
// cost here, and the team will move to a paid API tier instead of capping
// usage if free-tier limits become a problem.)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import app from '../app.js';

test('POST /rag/api/search/feedback requires auth', async () => {
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
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // backend/routes/auth.js's OTP/reset-token cleanup interval (pre-existing,
  // unrelated to this feature) isn't unref'd — harmless for the real
  // long-running server, but it would otherwise keep this short-lived test
  // process alive forever after the test itself is done.
  process.exit(0);
});
