// Companion to ask-swastha-specific-no-match.test.js (see that file's header
// for the bug this fixes). This file exercises searchReports end to end
// with a mocked AI client returning a specific, partial-match answer,
// confirming searchService.js's plumbing (parseStructuredAnswer, sources,
// etc.) faithfully carries that specific answer through rather than
// substituting or discarding it for anything generic — the fix itself is
// entirely in the prompt instruction (see the sibling test); this test
// guards the surrounding code that must not undo it.
//
// mock.module must run before searchService.js's first import (transitively
// via any other test in this process) — kept in its own file, with `mock`
// imported at module scope and used before any dynamic import, matching
// ask-swastha-unit.test.js's own established pattern for this exact reason.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const fakeSupabase = {
  rpc: async () => ({
    data: [
      { id: 1, report_id: 'r1', chunk_text: 'Amlodipine 5mg once daily. Telmisartan 40mg once daily.', chunk_index: 0, similarity: 0.7 },
    ],
    error: null,
  }),
  from: () => ({
    select: () => ({
      eq: () => ({
        in: async () => ({
          data: [{ id: 'r1', title: 'Prescription', category: 'Prescription', report_date: '2024-11-04', file_url: null }],
          error: null,
        }),
      }),
    }),
  }),
};
mock.module(new URL('../rag/config/supabase.js', import.meta.url).href, {
  namedExports: { supabase: fakeSupabase },
});

const specificHeadline =
  'Your records show Amlodipine and Telmisartan prescribed, but do not state which condition either medicine was prescribed for.';
mock.module(new URL('../rag/config/aiClient.js', import.meta.url).href, {
  namedExports: {
    embedText: async () => new Array(768).fill(0),
    embedTexts: async (texts) => texts.map(() => new Array(768).fill(0)),
    runAI: async ({ task }) => {
      if (task === 'generation') {
        return {
          ok: true,
          text: JSON.stringify({
            headline: specificHeadline,
            keyFacts: [
              { label: 'Medicine', detail: 'Amlodipine 5mg once daily', excerpt: 1 },
              { label: 'Medicine', detail: 'Telmisartan 40mg once daily', excerpt: 1 },
            ],
            caveat: "The excerpt lists these medications but doesn't state hypertension (or any other condition) as the reason they were prescribed.",
          }),
          model_used: 'mock',
          provider: 'mock',
          degraded: false,
        };
      }
      throw new Error(`unexpected runAI task in this test: ${task}`);
    },
    FRIENDLY_FALLBACK: "Swastha couldn't process this right now. Please try again shortly.",
    EMBEDDING_MODEL: 'gemini-embedding-001',
    EMBEDDING_DIMENSIONS: 768,
  },
});

test('a partial-match generation result flows through as a specific answer, not a generic string', async () => {
  const { searchReports } = await import('../rag/services/searchService.js');
  const result = await searchReports('What medications was I prescribed for hypertension?', `usr_${Date.now()}`);

  assert.equal(result.answer, specificHeadline);
  assert.notEqual(result.answer, "I couldn't find this information in your health records.");
  assert.equal(result.structured.keyFacts.length, 2);
  assert.match(result.structured.caveat, /doesn't state hypertension/);
  assert.equal(result.sources.length, 1, 'sources must still reflect the retrieved report despite the partial-match caveat');

  mock.reset();
  process.exit(0);
});
