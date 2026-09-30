// Adaptive full-context mode (see conversationalSearchService.js's
// tryFullContextAnswer): a patient whose total history is over
// FULL_CONTEXT_MAX_CHARS falls back to the existing retrieval path
// unchanged.
//
// Kept in its own file — see ask-swastha-full-context-small.test.js for why
// (node:test's mock.module can't re-mock an already-mocked specifier, so 3
// scenarios need 3 separate module registries/files).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { installFullContextMocks, reportRow } = await import('./helpers/fullContextMocks.js');

test('a patient with a large total history uses retrieval mode (falls back past the char budget)', async () => {
  const patientId = `usr_largehistory_${Date.now()}`;
  // FULL_CONTEXT_MAX_CHARS defaults to 100000 — one report's notes well
  // over that on its own is the simplest way to force the fallback
  // deterministically, without depending on the exact default staying
  // 100000 forever (still exercises the real comparison against whatever
  // the env resolves to, since this exceeds any sane threshold).
  const hugeNotes = 'x'.repeat(150_000);
  const calls = { embedText: 0, rpc: 0 };
  installFullContextMocks({
    allReportRows: [reportRow({ patientId, reportId: 'r1', notes: hugeNotes, reportDate: '2026-01-01' })],
    retrieverMatches: [
      { id: 1, report_id: 'r1', chunk_text: hugeNotes.slice(0, 500), chunk_index: 0, similarity: 0.9 },
    ],
    retrieverReports: [
      { id: 'r1', title: 'Fake Report', category: 'Consultation', report_date: '2026-01-01', file_url: null },
    ],
    calls,
  });

  const { conversationalSearch } = await import('../rag/services/conversationalSearchService.js');
  const sessionId = `sess-largehistory-${Date.now()}`;

  const result = await conversationalSearch({ query: 'Summarize my history.', userId: patientId, sessionId });

  assert.equal(result.noResultsFound, false);
  assert.equal(result.answer, 'Mock answer.');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].report_id, 'r1');
  // The real signal that retrieval mode (not full-context) actually ran:
  // embedding and the vector RPC were both invoked, which full-context mode
  // never does.
  assert.equal(calls.embedText, 1, 'retrieval mode must call embedText for the query');
  assert.equal(calls.rpc, 1, 'retrieval mode must call the vector-search RPC');

  mock.reset();
  process.exit(0);
});
