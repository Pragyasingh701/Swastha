// Fallback gate: with ALLOW_EDGE_TTS_FALLBACK explicitly "false" (the flag
// now DEFAULTS to true — see env.js) and Sarvam failing, ttsService.js's
// synthesizeSpeech must never reach speech.platform.bing.com
// (edge-tts-universal's backend) and must return the existing
// no-audio/text-only result instead.
//
// Sets process.env.ALLOW_EDGE_TTS_FALLBACK explicitly BEFORE importing
// env.js (transitively, via ttsService.js) — that module reads it once
// into a const at import time. Also mocks edge-tts-universal's EdgeTTS
// class itself (not just fetch): EdgeTTS talks over a raw WebSocket, not
// fetch, so intercepting fetch alone would not catch a broken gate that
// still constructs/connects an EdgeTTS instance. Kept in its own file with
// no static import of app.js or anything that would import ttsService.js
// first for an unrelated reason.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('with the flag explicitly false and Sarvam failing, no request reaches speech.platform.bing.com and the result is a plain no-audio failure', async () => {
  // Explicit "false", not unset — the flag now defaults to true, so this
  // test only exercises the OFF state when the value is deliberately set
  // to the literal string "false".
  process.env.ALLOW_EDGE_TTS_FALLBACK = 'false';
  // No Sarvam keys configured -> currentKey() returns null -> Sarvam fails
  // with NO_KEY before ever calling fetch. Deterministic, no network mock
  // needed for the Sarvam leg itself.
  delete process.env.SARVAM_API_KEYS;
  delete process.env.SARVAM_API_KEY;

  let edgeTTSConstructed = false;
  mock.module(new URL('../../node_modules/edge-tts-universal/dist/index.js', import.meta.url).href, {
    namedExports: {
      EdgeTTS: class {
        constructor() {
          edgeTTSConstructed = true;
        }
        async synthesize() {
          throw new Error('TEST FAILURE: EdgeTTS.synthesize() was called — the gate did not prevent this');
        }
      },
    },
  });

  const requestedHosts = [];
  const realFetch = global.fetch;
  global.fetch = async (url, ...args) => {
    const urlStr = String(url);
    requestedHosts.push(urlStr);
    if (urlStr.includes('speech.platform.bing.com') || urlStr.includes('bing.com')) {
      throw new Error(`TEST FAILURE: fetch() was called with an Edge-TTS/Bing URL: ${urlStr}`);
    }
    if (urlStr.includes('api.sarvam.ai')) {
      // Not expected to be reached in this test (no keys configured means
      // synthesizeWithSarvam short-circuits before fetch), but fail loudly
      // rather than silently succeed if that assumption ever changes.
      throw new Error('TEST FAILURE: unexpected fetch to api.sarvam.ai — this test assumes NO_KEY short-circuits before any network call');
    }
    return realFetch(url, ...args);
  };

  try {
    const { synthesizeSpeech, __clearTtsCache, __resetSarvamKeyState } = await import('../rag/services/ttsService.js');
    const { ALLOW_EDGE_TTS_FALLBACK } = await import('../rag/config/env.js');

    assert.equal(ALLOW_EDGE_TTS_FALLBACK, false, 'the flag must resolve to false for this test to be meaningful');

    __clearTtsCache();
    __resetSarvamKeyState();

    const result = await synthesizeSpeech('What brings you in today?', 'en-IN');

    assert.equal(result.ok, false);
    assert.equal(result.audio_base64, undefined, 'no-audio result must not carry an audio_base64 field');
    // Existing shape from synthesizeSpeech's total-failure branch: both
    // providers' error codes embedded in one string — Sarvam's NO_KEY (no
    // keys configured) and the new EDGE_TTS_DISABLED code from the gate.
    assert.match(result.error_code, /NO_KEY/);
    assert.match(result.error_code, /EDGE_TTS_DISABLED/);

    assert.equal(edgeTTSConstructed, false, 'EdgeTTS must never be constructed when the flag is false');

    const bingRequests = requestedHosts.filter((h) => h.includes('bing.com'));
    assert.equal(bingRequests.length, 0, 'no request of any kind should have been made to a bing.com host');
  } finally {
    global.fetch = realFetch;
  }

  mock.reset();
  process.exit(0);
});
