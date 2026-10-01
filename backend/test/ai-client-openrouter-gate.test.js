// Fallback gate: with ALLOW_OPENROUTER_FALLBACK explicitly "false" (the
// flag now DEFAULTS to true — see env.js) and every Gemini key/model
// failing, runAI must never make a request to OpenRouter and must return
// degraded:true instead.
//
// Sets process.env.ALLOW_OPENROUTER_FALLBACK explicitly BEFORE importing
// env.js (transitively, via aiClient.js) — that module reads it once into a
// const at import time, so setting it after the first import would have no
// effect. Kept in its own file with no static import of app.js/anything
// that would import aiClient.js first for an unrelated reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('with the flag explicitly false and every Gemini key failing, no request reaches OpenRouter and the result is degraded:true', async () => {
  // Explicit "false", not unset — the flag now defaults to true, so this
  // test only exercises the OFF state when the value is deliberately set
  // to the literal string "false".
  process.env.ALLOW_OPENROUTER_FALLBACK = 'false';

  const requestedHosts = [];
  const realFetch = global.fetch;
  global.fetch = async (url, ...args) => {
    const urlStr = String(url);
    requestedHosts.push(urlStr);

    if (urlStr.includes('openrouter.ai')) {
      // Should never be reached — fail loudly rather than let a mocked
      // "success" response mask the bug this test exists to catch.
      throw new Error(`TEST FAILURE: fetch() was called with an OpenRouter URL: ${urlStr}`);
    }

    if (urlStr.includes('generativelanguage.googleapis.com')) {
      // Simulate a transient failure on every Gemini attempt (every
      // key x every model in the ladder), so runAI exhausts the entire
      // Gemini side and — if the gate were broken — would try OpenRouter
      // next.
      return {
        ok: false,
        status: 500,
        text: async () => 'simulated failure (test only)',
        json: async () => ({}),
      };
    }

    return realFetch(url, ...args);
  };

  try {
    const { runAI } = await import('../rag/config/aiClient.js');
    const { ALLOW_OPENROUTER_FALLBACK } = await import('../rag/config/env.js');

    assert.equal(ALLOW_OPENROUTER_FALLBACK, false, 'the flag must resolve to false for this test to be meaningful');

    const result = await runAI({
      task: 'generation',
      input: 'Patient diagnosis: hypertension. Medicines: amlodipine 5mg daily.',
      label: 'openrouter-gate-test',
    });

    assert.equal(result.ok, false);
    assert.equal(result.degraded, true);
    assert.equal(result.provider, null);
    assert.equal(result.text, "Swastha couldn't process this right now. Please try again shortly.");

    const openRouterRequests = requestedHosts.filter((h) => h.includes('openrouter.ai'));
    assert.equal(openRouterRequests.length, 0, 'no request of any kind should have been made to openrouter.ai');

    // Sanity check that the mock actually engaged the Gemini failure path
    // (i.e. this isn't a false pass from the mock never being hit at all).
    const geminiRequests = requestedHosts.filter((h) => h.includes('generativelanguage.googleapis.com'));
    assert.ok(geminiRequests.length > 0, 'the test must have actually exercised the Gemini failure path');
  } finally {
    global.fetch = realFetch;
  }

  process.exit(0);
});
