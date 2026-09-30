// The aggregate path (answerAggregateQuestion, searchService.js) and
// full-context mode (tryFullContextAnswer, conversationalSearchService.js)
// now share exactly one loader — loadPatientReportsForPrompt — for reading
// a patient's whole `reports` history. This test proves the aggregate path
// genuinely goes through that shared loader (same table, same field list,
// same patient scoping), not a separate query someone could let drift.
//
// Verified by mocking the Supabase client's `reports` query itself and
// asserting the exact field list and patient_id filter the aggregate path
// requests match loadPatientReportsForPrompt's own — if answerAggregateQuestion
// ever stopped calling the shared loader and went back to its own narrower
// .select(...), this test's field-list assertion would catch it.
//
// Kept in its own file — see ask-swastha-full-context-small.test.js for why
// (node:test's mock.module can't re-mock an already-mocked specifier, so
// each module-mocking scenario needs its own process/module registry).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('the aggregate path (answerAggregateQuestion) uses the same reports loader as full-context mode', async () => {
  const patientId = `usr_aggregate_${Date.now()}`;
  const selectCalls = [];

  const fakeReport = {
    id: 'r1',
    title: 'Annual Checkup',
    report_date: '2026-05-01',
    category: 'Consultation',
    hospital: 'City Hospital',
    doctor: 'Dr. Patel',
    diagnosis: 'Routine, no findings',
    medicines: null,
    notes: 'All vitals normal.',
    file_url: null,
  };

  const fakeSupabase = {
    from: (table) => ({
      select: (fields) => {
        selectCalls.push({ table, fields });
        return {
          eq: (col, val) => {
            const chain = {
              order: () => chain,
              then: (resolve) => resolve({ data: val === patientId ? [fakeReport] : [], error: null }),
            };
            return chain;
          },
        };
      },
    }),
  };
  mock.module(new URL('../rag/config/supabase.js', import.meta.url).href, {
    namedExports: { supabase: fakeSupabase },
  });

  mock.module(new URL('../rag/config/aiClient.js', import.meta.url).href, {
    namedExports: {
      embedText: async () => new Array(768).fill(0),
      embedTexts: async (texts) => texts.map(() => new Array(768).fill(0)),
      runAI: async ({ task }) => {
        if (task === 'generation') {
          return {
            ok: true,
            text: JSON.stringify({ headline: 'You have 1 report on file.', keyFacts: [], caveat: '' }),
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

  const { answerAggregateQuestion } = await import('../rag/services/searchService.js');

  const result = await answerAggregateQuestion('How many reports do I have?', patientId);

  assert.equal(result.noResultsFound, false);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].report_id, 'r1');

  // Exactly one `reports` query was made, requesting the shared loader's
  // full field list (title, report_date, category, hospital, doctor,
  // diagnosis, medicines, notes, file_url) — not a narrower, separately
  // hand-maintained field list.
  const reportsSelectCalls = selectCalls.filter((c) => c.table === 'reports');
  assert.equal(reportsSelectCalls.length, 1, 'exactly one reports query should be made');
  const requestedFields = reportsSelectCalls[0].fields;
  for (const field of ['title', 'report_date', 'category', 'hospital', 'doctor', 'diagnosis', 'medicines', 'notes', 'file_url']) {
    assert.ok(requestedFields.includes(field), `shared loader's field list must include "${field}", got: ${requestedFields}`);
  }

  mock.reset();
  process.exit(0);
});
