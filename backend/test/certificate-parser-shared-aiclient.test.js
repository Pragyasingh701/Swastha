// Confirms the doctor-certificate OCR flow (backend/services/
// certificateParserService.js) still works correctly now that it imports
// the shared backend/rag/config/aiClient.js directly, instead of a
// byte-mirrored local copy (backend/services/aiClient.js, deleted).
//
// Two things verified: (1) a successful Gemini extraction flows all the
// way through to a correctly-shaped result, and (2) on total Gemini
// failure, the shared client's ALLOW_OPENROUTER_FALLBACK gate — whatever
// it resolves to from the real environment (defaults to true; see env.js)
// — is honored the same way here as everywhere else, confirming the merge
// didn't silently carve out an exception for this call site.
//
// Mocks fetch only (not aiClient.js itself), since this test wants to
// exercise the REAL shared client's real logic, not a stand-in for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

// A minimal valid 1x1 PNG, base64-encoded — Vision extraction itself is
// mocked below, so the actual pixel content is irrelevant; this just needs
// to be a well-formed data: URL that fileToBase64Payload can parse.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('certificate parsing succeeds through the shared aiClient on a normal Gemini response', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url, ...args) => {
    const urlStr = String(url);
    if (urlStr.includes('generativelanguage.googleapis.com')) {
      const fakeGeminiResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    isMedicalCertificate: true,
                    regNumber: 'MCI-99999',
                    doctorName: 'Dr. Test Doctor',
                    medicalCouncil: 'Test Medical Council',
                    qualifications: ['MBBS'],
                    expiryDate: null,
                    isExpired: false,
                  }),
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      };
      return { ok: true, status: 200, text: async () => JSON.stringify(fakeGeminiResponse) };
    }
    if (urlStr.includes('openrouter.ai')) {
      throw new Error('TEST FAILURE: openrouter.ai must not be reached when Gemini already succeeded');
    }
    return realFetch(url, ...args);
  };

  try {
    const { processMedicalCertificate } = await import('../services/certificateParserService.js');
    const result = await processMedicalCertificate(TINY_PNG_DATA_URL, {
      regNumber: 'MCI-99999',
      fullName: 'Dr. Test Doctor',
    });

    assert.equal(result.success, true);
    assert.equal(result.engine, 'Google Gemini Vision AI');
    assert.equal(result.isMedicalCertificate, true);
    assert.equal(result.validationError, null);
    assert.equal(result.extractedData.doctorName, 'Dr. Test Doctor');
    assert.equal(result.extractedData.regNumber, 'MCI-99999');
  } finally {
    global.fetch = realFetch;
  }
});

test('on total Gemini failure, certificate parsing honors the shared ALLOW_OPENROUTER_FALLBACK gate like every other call site', async () => {
  const requestedHosts = [];
  const realFetch = global.fetch;
  global.fetch = async (url, ...args) => {
    const urlStr = String(url);
    requestedHosts.push(urlStr);
    if (urlStr.includes('generativelanguage.googleapis.com')) {
      return { ok: false, status: 500, text: async () => 'simulated total Gemini failure (test only)' };
    }
    if (urlStr.includes('openrouter.ai')) {
      // Simulated OpenRouter failure too, so this test's outcome doesn't
      // depend on live OpenRouter credentials/network either way — the
      // point here is confirming whether the gate lets the request THROUGH,
      // not whether OpenRouter itself succeeds.
      return { ok: false, status: 500, text: async () => 'simulated total OpenRouter failure (test only)' };
    }
    return realFetch(url, ...args);
  };

  try {
    const { ALLOW_OPENROUTER_FALLBACK } = await import('../rag/config/env.js');
    const { processMedicalCertificate } = await import('../services/certificateParserService.js');
    const result = await processMedicalCertificate(TINY_PNG_DATA_URL, { regNumber: 'MCI-99999' });

    assert.equal(result.success, false);
    assert.equal(result.engine, 'Vision AI Status Check');
    assert.match(result.validationError, /Vision AI extraction failed/);

    const openRouterRequests = requestedHosts.filter((h) => h.includes('openrouter.ai'));
    const geminiRequests = requestedHosts.filter((h) => h.includes('generativelanguage.googleapis.com'));
    assert.ok(geminiRequests.length > 0, 'the test must have actually exercised the Gemini failure path');

    if (ALLOW_OPENROUTER_FALLBACK) {
      assert.ok(openRouterRequests.length > 0, 'with the fallback enabled, OpenRouter must actually be tried after Gemini is exhausted');
    } else {
      assert.equal(openRouterRequests.length, 0, 'with the fallback disabled, no request of any kind should reach openrouter.ai');
    }
  } finally {
    global.fetch = realFetch;
  }
});
