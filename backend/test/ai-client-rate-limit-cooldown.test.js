// Fix: a Gemini key that returned 429/RESOURCE_EXHAUSTED (rate-limited) used
// to be retried on every SUBSEQUENT call too — nothing persisted that it
// was exhausted, so liveKeys() would try it again from scratch next time,
// paying its full per-attempt timeout before moving to a key that actually
// had quota. With several keys simultaneously rate-limited under real
// traffic (the reported production symptom: a colleague running load
// against the same keys), this turned a call that should resolve in well
// under a second into a 30-60+ second wait, since the ladder re-discovered
// the same dead-on-arrival keys on every single request.
//
// Fix: a rate-limited key is now benched for RATE_LIMIT_COOLDOWN_MS (60s) —
// liveKeys() skips it until the cooldown expires, so the NEXT call goes
// straight to a key that wasn't just rate-limited, instead of re-paying the
// discovery cost.
//
// Mocks global.fetch directly (not mock.module) — this tests aiClient.js's
// own internal key-rotation state, same pattern as
// ai-client-openrouter-gate.test.js.
// No app.js import anywhere in this file (directly or transitively), so
// none of auth.js's un-unref'd cleanup intervals are ever started here —
// unlike several other files in this suite, this one does NOT need a
// process.exit(0)/after() hook to force the process down, and deliberately
// has neither: node:test's top-level tests run sequentially but an
// after()+process.exit() pairing was observed (while writing this file) to
// fire after only the first two of three tests had completed, silently
// dropping the third's result from the report before it could be counted —
// a real node:test timing hazard, not specific to this file. Leaving the
// process to exit naturally avoids it entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('a rate-limited key is skipped on the NEXT call instead of being retried from scratch', async () => {
  const { runAI, __testing } = await import('../rag/config/aiClient.js');
  const { GEMINI_API_KEYS } = await import('../rag/config/env.js');

  assert.ok(GEMINI_API_KEYS.length >= 2, 'this test needs at least 2 configured Gemini keys to be meaningful');

  const requestsByKey = []; // in call order: the x-goog-api-key header value for each attempt
  const realFetch = global.fetch;
  global.fetch = async (url, options) => {
    const urlStr = String(url);
    if (!urlStr.includes('generativelanguage.googleapis.com')) return realFetch(url, options);

    const usedKey = options.headers['x-goog-api-key'];
    requestsByKey.push(usedKey);

    // The very FIRST key tried (whichever liveKeys() picks first) is
    // rate-limited; every other key succeeds immediately. This isolates the
    // behavior under test: does the SECOND call still try the rate-limited
    // key first (the bug), or does it skip straight to a live one (the fix)?
    if (usedKey === GEMINI_API_KEYS[0]) {
      return { ok: false, status: 429, text: async () => 'RESOURCE_EXHAUSTED' };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }, ] }),
    };
  };

  try {
    // First call: key[0] is tried, gets rate-limited, ladder moves on to
    // the next key and succeeds. This call's own result isn't the point —
    // it's what happens on the SECOND call that proves the fix.
    const first = await runAI({ task: 'generation', input: 'first call', label: 'cooldown-test-1' });
    assert.equal(first.ok, true, 'the first call must still succeed via a later key in the ladder');

    const keysTriedOnFirstCall = requestsByKey.length;
    assert.ok(keysTriedOnFirstCall >= 2, 'the first call must have tried at least 2 keys (key[0] rate-limited, then a live one)');
    assert.equal(requestsByKey[0], GEMINI_API_KEYS[0], 'key[0] must be the one tried first on the initial call');

    // Second call: key[0] is STILL "rate-limited" per the mock above (it
    // would 429 again if tried) — but it's now on cooldown, so the fix
    // means liveKeys() must not offer it first (or at all) this time.
    requestsByKey.length = 0;
    const second = await runAI({ task: 'generation', input: 'second call', label: 'cooldown-test-2' });

    assert.equal(second.ok, true);
    assert.notEqual(
      requestsByKey[0],
      GEMINI_API_KEYS[0],
      'the second call must not try the still-rate-limited key first — it should be skipped while on cooldown'
    );
    assert.equal(requestsByKey.length, 1, 'the second call should resolve on its first attempt once the bad key is skipped');
  } finally {
    global.fetch = realFetch;
    __testing.deadKeys.clear();
    __testing.rateLimitedUntil.clear();
  }
});

test('liveKeys falls back to trying every key anyway if all of them are currently on cooldown', async () => {
  const { __testing } = await import('../rag/config/aiClient.js');
  const { GEMINI_API_KEYS } = await import('../rag/config/env.js');

  const future = Date.now() + __testing.RATE_LIMIT_COOLDOWN_MS;
  GEMINI_API_KEYS.forEach((_, i) => __testing.rateLimitedUntil.set(i, future));

  const keys = __testing.liveKeys();

  assert.equal(keys.length, GEMINI_API_KEYS.length, 'must still return every key rather than an empty list when all are on cooldown');

  __testing.rateLimitedUntil.clear();
});

test('a key that is not on cooldown is still offered normally', async () => {
  const { __testing } = await import('../rag/config/aiClient.js');
  const { GEMINI_API_KEYS } = await import('../rag/config/env.js');

  const keys = __testing.liveKeys();

  assert.equal(keys.length, GEMINI_API_KEYS.length, 'with no cooldowns or dead keys, every configured key must be offered');
});
