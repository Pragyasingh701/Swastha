// Adaptive full-context mode (see conversationalSearchService.js's
// tryFullContextAnswer): patient scoping must hold exactly like the
// existing retrieval path — one patient's chunks must never appear in
// another patient's answer, even though full-context mode bypasses
// embedding/the RPC (where scoping is normally enforced by
// match_report_embeddings' own SQL WHERE clause) and instead relies on a
// plain .eq('patient_id', ...) filter applied client-side in this test's
// mock (mirroring the real Supabase query's WHERE clause).
//
// Kept in its own file — see ask-swastha-full-context-small.test.js for why
// (node:test's mock.module can't re-mock an already-mocked specifier, so 3
// scenarios need 3 separate module registries/files).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { installFullContextMocks, chunkRow } = await import('./helpers/fullContextMocks.js');

test("patient scoping holds in full-context mode: one patient's chunks never appear for another", async () => {
  const patientA = `usr_scopeA_${Date.now()}`;
  const patientB = `usr_scopeB_${Date.now()}`;
  installFullContextMocks({
    allRows: [
      chunkRow({
        patientId: patientA,
        reportId: 'a1',
        chunkIndex: 0,
        text: 'Patient A note.',
        reportDate: '2026-01-01',
        title: 'Patient A Report',
      }),
      chunkRow({
        patientId: patientB,
        reportId: 'b1',
        chunkIndex: 0,
        text: 'Patient B note.',
        reportDate: '2026-01-01',
        title: 'Patient B Report',
      }),
    ],
  });

  const { conversationalSearch } = await import('../rag/services/conversationalSearchService.js');

  const resultA = await conversationalSearch({
    query: 'What do my notes say?',
    userId: patientA,
    sessionId: `sess-scopeA-${Date.now()}`,
  });
  const resultB = await conversationalSearch({
    query: 'What do my notes say?',
    userId: patientB,
    sessionId: `sess-scopeB-${Date.now()}`,
  });

  assert.equal(resultA.sources.length, 1);
  assert.equal(resultA.sources[0].report_id, 'a1');
  assert.equal(resultA.sources[0].title, 'Patient A Report');

  assert.equal(resultB.sources.length, 1);
  assert.equal(resultB.sources[0].report_id, 'b1');
  assert.equal(resultB.sources[0].title, 'Patient B Report');

  // Neither patient's source list contains the other's report id — the
  // core scoping guarantee full-context mode must preserve exactly like
  // retrieval already does via patient_id in the SQL.
  assert.ok(!resultA.sources.some((s) => s.report_id === 'b1'));
  assert.ok(!resultB.sources.some((s) => s.report_id === 'a1'));

  mock.reset();
  process.exit(0);
});
