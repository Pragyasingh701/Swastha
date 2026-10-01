// Adaptive full-context mode (see conversationalSearchService.js's
// tryFullContextAnswer): a patient with MORE reports than
// loadPatientReportsForPrompt's row limit (1000) falls back to the existing
// retrieval path, exactly like being over the char budget — even though each
// individual report here is tiny and would easily fit under
// FULL_CONTEXT_MAX_CHARS on its own.
//
// Kept in its own file — see ask-swastha-full-context-small.test.js for why
// (node:test's mock.module can't re-mock an already-mocked specifier, so
// each scenario needs its own process/module registry).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { installFullContextMocks, reportRow } = await import('./helpers/fullContextMocks.js');

test('a patient over the row limit uses retrieval mode (falls back past 1000 reports)', async () => {
  const patientId = `usr_rowlimit_${Date.now()}`;

  // 1001 small reports — one more than loadPatientReportsForPrompt's
  // DEFAULT_REPORTS_LIMIT of 1000 — so the real query's .limit(1001) returns
  // all of them and the loader's own truncated-detection (rows.length >
  // limit) fires, rather than this test hand-waving truncation.
  const allReportRows = Array.from({ length: 1001 }, (_, i) =>
    reportRow({
      patientId,
      reportId: `r${i + 1}`,
      notes: `Short note ${i + 1}.`,
      reportDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    })
  );

  const calls = { embedText: 0, rpc: 0 };
  installFullContextMocks({
    allReportRows,
    retrieverMatches: [
      { id: 1, report_id: 'r1', chunk_text: 'Short note 1.', chunk_index: 0, similarity: 0.9 },
    ],
    retrieverReports: [
      { id: 'r1', title: 'Fake Report', category: 'Consultation', report_date: '2026-01-01', file_url: null },
    ],
    calls,
  });

  const { conversationalSearch } = await import('../rag/services/conversationalSearchService.js');
  const sessionId = `sess-rowlimit-${Date.now()}`;

  const result = await conversationalSearch({ query: 'Summarize my history.', userId: patientId, sessionId });

  assert.equal(result.noResultsFound, false);
  assert.equal(result.answer, 'Mock answer.');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].report_id, 'r1');
  // The real signal that retrieval mode (not full-context) actually ran:
  // embedding and the vector RPC were both invoked, which full-context mode
  // never does — proving tryFullContextAnswer bailed out on `truncated`
  // rather than trying to stuff 1001 reports into one prompt.
  assert.equal(calls.embedText, 1, 'retrieval mode must call embedText for the query');
  assert.equal(calls.rpc, 1, 'retrieval mode must call the vector-search RPC');

  mock.reset();
  process.exit(0);
});
