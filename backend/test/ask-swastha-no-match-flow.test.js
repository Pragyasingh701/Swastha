// Companion to ask-swastha-no-match-prompt.test.js (see that file's header
// for the bug this fixes). Exercises searchReports end to end with a
// mocked AI client that gives DIFFERENT specific replies depending on the
// query, proving generateNoMatchAnswer's plumbing (runAI call, degraded
// fallback, parseStructuredAnswer reuse) actually surfaces a
// question-specific reply instead of the one fixed NO_RESULTS_MESSAGE
// sentence for every zero-match case.
//
// mock.module must run before searchService.js's first import — kept in
// its own file, mocks registered at module scope before any dynamic
// import, matching this suite's established pattern.
import { test, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

// Zero matches on every call — retrieval never clears SIMILARITY_THRESHOLD,
// so every question in this file exercises the zero-match/generateNoMatchAnswer
// branch, never the real grounded-answer path.
const fakeSupabase = {
  rpc: async () => ({ data: [], error: null }),
};
mock.module(new URL('../rag/config/supabase.js', import.meta.url).href, {
  namedExports: { supabase: fakeSupabase },
});

// Returns a DIFFERENT reply depending on the actual question text, so the
// test can prove the real question reaches the model (not a fixed prompt
// that would produce the same output regardless of what was asked).
mock.module(new URL('../rag/config/aiClient.js', import.meta.url).href, {
  namedExports: {
    embedText: async () => new Array(768).fill(0),
    embedTexts: async (texts) => texts.map(() => new Array(768).fill(0)),
    runAI: async ({ task, input }) => {
      if (task !== 'generation') throw new Error(`unexpected runAI task in this test: ${task}`);
      if (input.includes('__SIMULATE_AI_FAILURE__')) {
        return { ok: false, text: "Swastha couldn't process this right now. Please try again shortly.", degraded: true };
      }
      const isOffTopic = input.includes('hi whats your name');
      return {
        ok: true,
        text: isOffTopic
          ? "I'm here to help you look through your health records — try asking about a diagnosis, medication, or report."
          : "Your records don't contain any information about hypertension medication.",
        model_used: 'mock',
        provider: 'mock',
        degraded: false,
      };
    },
    FRIENDLY_FALLBACK: "Swastha couldn't process this right now. Please try again shortly.",
    EMBEDDING_MODEL: 'gemini-embedding-001',
    EMBEDDING_DIMENSIONS: 768,
  },
});

const { searchReports } = await import('../rag/services/searchService.js');

// Registered BEFORE the test() calls, not inside the last one — exiting
// synchronously inside a test can race the test runner's own TAP output
// for that test still being flushed to stdout, silently dropping it from
// the report (same issue documented across this test suite).
after(() => {
  mock.reset();
  setImmediate(() => process.exit(0));
});

test('a genuine health question with zero matches gets a specific, topic-named reply', async () => {
  const result = await searchReports('What medications was I prescribed for hypertension?', `usr_${Date.now()}`);

  assert.equal(result.noResultsFound, true);
  assert.equal(result.sources.length, 0);
  assert.equal(result.answer, "Your records don't contain any information about hypertension medication.");
  assert.notEqual(
    result.answer,
    'No relevant records found in your health history for this question.',
    'must not fall back to the old one-size-fits-all sentence when the AI call succeeds'
  );
});

test('an off-topic message gets a different, redirecting reply — not the same generic wall of text', async () => {
  const result = await searchReports('hi whats your name', `usr_${Date.now()}`);

  assert.equal(result.noResultsFound, true);
  assert.equal(
    result.answer,
    "I'm here to help you look through your health records — try asking about a diagnosis, medication, or report."
  );
});

test('the two replies above are genuinely different from each other', async () => {
  const healthResult = await searchReports('What medications was I prescribed for hypertension?', `usr_${Date.now()}`);
  const offTopicResult = await searchReports('hi whats your name', `usr_${Date.now()}`);

  assert.notEqual(healthResult.answer, offTopicResult.answer);
});

test('if the no-match reply generation itself fails, it falls back to the fixed message rather than erroring', async () => {
  const { searchReports: freshSearchReports } = await import('../rag/services/searchService.js');
  const result = await freshSearchReports('__SIMULATE_AI_FAILURE__ what were my labs', `usr_${Date.now()}`);

  assert.equal(result.noResultsFound, true);
  assert.equal(result.answer, 'No relevant records found in your health history for this question.');
});
