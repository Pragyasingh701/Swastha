// The aggregate path (answerAggregateQuestion, searchService.js) caps its
// prompt when a patient's full report history would exceed
// FULL_CONTEXT_MAX_CHARS once built into excerpt text: it keeps the most
// recent reports (dropping the oldest), tells the model only a subset was
// included, and forces that disclosure onto the returned answer's caveat
// regardless of what the model itself said — a count/summary answer is
// actively misleading without it.
//
// Kept in its own file — see ask-swastha-full-context-small.test.js for why
// (node:test's mock.module can't re-mock an already-mocked specifier, so
// each module-mocking scenario needs its own process/module registry).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('an oversized aggregate prompt is capped to the most recent reports and the answer says so', async () => {
  const patientId = `usr_aggregatecapped_${Date.now()}`;

  // FULL_CONTEXT_MAX_CHARS defaults to 100000. 200 reports at ~600 chars of
  // excerpt text each is comfortably over that, while still being under
  // DEFAULT_REPORTS_LIMIT (1000) — isolating the char-budget cap from the
  // row-limit cap (see ask-swastha-full-context-row-limit.test.js for that
  // one instead).
  const totalReports = 200;
  const bigDiagnosis = 'x'.repeat(500);
  const allReports = Array.from({ length: totalReports }, (_, i) => ({
    id: `r${i + 1}`,
    title: `Report ${i + 1}`,
    report_date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    category: 'Consultation',
    hospital: null,
    doctor: null,
    diagnosis: bigDiagnosis,
    medicines: null,
    notes: null,
    file_url: null,
  }));

  let capturedPrompt = null;

  const fakeSupabase = {
    from: (table) => ({
      select: () => ({
        eq: (col, val) => {
          const chain = {
            order: () => chain,
            limit: () => chain,
            then: (resolve) => resolve({ data: val === patientId ? allReports : [], error: null }),
          };
          return chain;
        },
      }),
    }),
  };
  mock.module(new URL('../rag/config/supabase.js', import.meta.url).href, {
    namedExports: { supabase: fakeSupabase },
  });

  mock.module(new URL('../rag/config/aiClient.js', import.meta.url).href, {
    namedExports: {
      embedText: async () => new Array(768).fill(0),
      embedTexts: async (texts) => texts.map(() => new Array(768).fill(0)),
      runAI: async ({ task, input }) => {
        if (task === 'generation') {
          capturedPrompt = input;
          // Model deliberately does NOT mention the cap in its own caveat —
          // proving the disclosure is forced by code, not left to the model.
          return {
            ok: true,
            text: JSON.stringify({ headline: `You have ${totalReports} reports on file.`, keyFacts: [], caveat: '' }),
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
  // Fewer sources than the true total — proof the prompt (and the returned
  // sources, which mirror what was actually sent) were capped.
  assert.ok(result.sources.length < totalReports, `sources should be capped, got ${result.sources.length}`);
  assert.ok(result.sources.length > 0, 'at least the most recent report must still be included');

  // The kept sources must be the MOST RECENT ones (highest report_date /
  // last-indexed rows), not the oldest.
  const keptIds = result.sources.map((s) => s.report_id);
  const newestId = `r${totalReports}`;
  assert.ok(keptIds.includes(newestId), 'the most recent report must be kept');
  assert.ok(!keptIds.includes('r1'), 'the oldest report must have been dropped');

  // The forced caveat must disclose the cap, even though the mocked model's
  // own caveat field was empty.
  assert.match(
    result.structured.caveat,
    /most recent/i,
    'the caveat must disclose that only the most recent reports were included'
  );
  assert.match(result.structured.caveat, /incomplete/i, 'the caveat must warn the count/summary may be incomplete');
  assert.match(result.structured.caveat, new RegExp(String(totalReports)), 'the caveat must mention the true total');

  // The model itself must have been told about the cap in the prompt (not
  // just the post-hoc forced caveat) — this is the "tell the model" half of
  // the requirement, separate from "tell the answer's caveat."
  assert.ok(capturedPrompt, 'the prompt must have been captured');
  assert.match(capturedPrompt, /most recent/i, 'the prompt must tell the model only the most recent reports are included');
  assert.match(capturedPrompt, new RegExp(String(totalReports)), 'the prompt must mention the true total report count');

  mock.reset();
  process.exit(0);
});
