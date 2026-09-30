// Adaptive full-context mode (see conversationalSearchService.js's
// tryFullContextAnswer): a patient with a small total history uses
// full-context mode, skipping embedding + vector search entirely.
//
// Kept in its own file — see ask-swastha-full-context-large.test.js and
// ask-swastha-full-context-scoping.test.js for why 3 separate files:
// node:test's mock.module refuses to re-mock an already-mocked specifier,
// so 3 module-mocking scenarios in one file don't work; each needs its own
// process/module registry.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

// env.js (imported by conversationalSearchService.js for
// FULL_CONTEXT_MAX_CHARS) validates required env vars and exits at import
// time if missing — load .env directly, without going through app.js
// (which would also eagerly load the real aiClient.js/supabase.js before
// the mocks below are registered).
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { installFullContextMocks, reportRow } = await import('./helpers/fullContextMocks.js');

test('a patient with a small total history uses full-context mode (skips embedding/retrieval)', async () => {
  const patientId = `usr_smallhistory_${Date.now()}`;
  const calls = { embedText: 0, rpc: 0 };
  installFullContextMocks({
    allReportRows: [
      reportRow({ patientId, reportId: 'r1', notes: 'Short note one.', reportDate: '2026-01-01' }),
      reportRow({ patientId, reportId: 'r2', notes: 'Short note two.', reportDate: '2026-02-01' }),
    ],
    calls,
  });

  const { conversationalSearch } = await import('../rag/services/conversationalSearchService.js');
  const sessionId = `sess-smallhistory-${Date.now()}`;

  const result = await conversationalSearch({ query: 'What do my notes say?', userId: patientId, sessionId });

  assert.equal(result.degraded, undefined);
  assert.equal(result.noResultsFound, false);
  assert.equal(result.answer, 'Mock answer.');
  // 2 reports -> 2 sources, both from THIS patient's rows.
  assert.equal(result.sources.length, 2);
  assert.deepEqual(
    result.sources.map((s) => s.report_id).sort(),
    ['r1', 'r2']
  );
  // The whole point of full-context mode: embedding and the vector RPC are
  // never called when the patient's history fits under the char budget.
  assert.equal(calls.embedText, 0, 'embedText must not be called in full-context mode');
  assert.equal(calls.rpc, 0, 'the vector-search RPC must not be called in full-context mode');

  mock.reset();
  process.exit(0);
});
