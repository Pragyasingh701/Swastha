// Companion to ask-swastha-no-match-prompt.test.js/ask-swastha-no-match-flow.test.js
// (see the first file's header for the bug this fixes). Those two cover the
// one-shot searchReports path; this file proves conversationalSearch's
// retrieval path (POST /rag/api/search/chat) has the same fix — a
// zero-match turn gets a reply tailored to the actual question instead of
// the fixed NO_RESULTS_MESSAGE sentence for every case.
//
// No static import of app.js — mock.module only intercepts a module's
// FIRST load, so mocks are registered before any dynamic import, matching
// ask-swastha-unit.test.js's established pattern.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const specificReply = "Your records don't contain any information about hypertension medication.";

mock.module(new URL('../rag/config/aiClient.js', import.meta.url).href, {
  namedExports: {
    embedText: async () => new Array(768).fill(0),
    embedTexts: async (texts) => texts.map(() => new Array(768).fill(0)),
    runAI: async ({ task }) => {
      if (task === 'generation') {
        return { ok: true, text: specificReply, model_used: 'mock', provider: 'mock', degraded: false };
      }
      throw new Error(`unexpected runAI task in this test: ${task}`);
    },
    FRIENDLY_FALLBACK: "Swastha couldn't process this right now. Please try again shortly.",
    EMBEDDING_MODEL: 'gemini-embedding-001',
    EMBEDDING_DIMENSIONS: 768,
  },
});

// Same shape as ask-swastha-unit.test.js's fakeSupabase: the full-context
// load (structured_history-style .order().order() chain, must resolve to
// zero rows) and the retrieval RPC (zero matches, to force the
// zero-match/generateNoMatchAnswer branch under test) are distinguished by
// call shape, not by table name — both go through 'reports'/rpc calls this
// mock has to serve correctly for conversationalSearch to reach the code
// path this test actually means to exercise.
const fakeSupabase = {
  rpc: async () => ({ data: [], error: null }), // zero matches -> docs.length === 0
  from: () => ({
    select: () => ({
      eq: () => {
        const chain = {
          order: () => chain,
          limit: () => chain,
          then: (resolve) => resolve({ data: [], error: null }),
          in: async () => ({ data: [], error: null }),
        };
        return chain;
      },
    }),
  }),
};
mock.module(new URL('../rag/config/supabase.js', import.meta.url).href, {
  namedExports: { supabase: fakeSupabase },
});

test('conversationalSearch gives a question-specific reply on a zero-match turn, not the fixed NO_RESULTS_MESSAGE', async () => {
  const { conversationalSearch } = await import('../rag/services/conversationalSearchService.js');

  const sessionId = `sess-nomatch-${Date.now()}`;
  const userId = `usr_nomatch_${Date.now()}`;

  const result = await conversationalSearch({
    query: 'What medications was I prescribed for hypertension?',
    userId,
    sessionId,
  });

  assert.equal(result.noResultsFound, true);
  assert.equal(result.sources.length, 0);
  assert.equal(result.answer, specificReply);
  assert.notEqual(
    result.answer,
    'No relevant records found in your health history for this question.',
    'must not fall back to the old fixed sentence when the AI call succeeds'
  );

  mock.reset();
  process.exit(0);
});
