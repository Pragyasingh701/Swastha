// Shared mock-building helpers for the 3 full-context-mode test files
// (ask-swastha-full-context-*.test.js). Each scenario needs its own
// process/module-registry — node:test's mock.module only intercepts a
// module's FIRST load and refuses to re-mock an already-mocked specifier —
// which is why these 3 scenarios live in 3 separate files rather than 3
// test() blocks in one file. This helper module itself is never mocked, so
// importing it from multiple test files is safe.
import { mock } from 'node:test';

export const FRIENDLY_FALLBACK = "Swastha couldn't process this right now. Please try again shortly.";

/**
 * Builds a fake report_embeddings row shaped exactly like the real
 * .select('chunk_text, chunk_index, report_id, reports(title, report_date, category, file_url)')
 * join tryFullContextAnswer performs. `_patientId` is test-only bookkeeping,
 * stripped before the mock "returns" a row (the real query never has a
 * patient_id column selected on report_embeddings rows themselves in this
 * join shape).
 */
export function chunkRow({ patientId, reportId, chunkIndex, text, reportDate, title = 'Fake Report' }) {
  return {
    _patientId: patientId,
    chunk_text: text,
    chunk_index: chunkIndex,
    report_id: reportId,
    reports: { title, report_date: reportDate, category: 'Consultation', file_url: null },
  };
}

/**
 * Installs both mocked modules conversationalSearch depends on before
 * generation: the Supabase client (whose report_embeddings query actually
 * respects .eq('patient_id', ...) — real patient scoping, not a canned
 * response — and returns rows sorted by report_date then chunk_index, same
 * as the real .order().order() chain would) and the AI failover client
 * (embedText/runAI). `calls` gets `.embedText`/`.rpc` counters bumped on
 * every real invocation, so a test can assert full-context mode genuinely
 * skipped them, not just assert on the final answer shape.
 *
 * Must be called at most once per process (each of the 3 test files calls
 * it exactly once, at module scope or inside its single test()).
 */
export function installFullContextMocks({
  allRows,
  retrieverMatches = [],
  retrieverReports = [],
  calls = { embedText: 0, rpc: 0 },
}) {
  const fakeSupabase = {
    rpc: async () => {
      calls.rpc += 1;
      return { data: retrieverMatches, error: null };
    },
    from: (table) => {
      if (table === 'report_embeddings') {
        return {
          select: () => ({
            eq: (col, val) => {
              const filtered = allRows.filter((r) => r._patientId === val);
              const sorted = [...filtered].sort((a, b) => {
                const dateCmp = String(a.reports.report_date).localeCompare(String(b.reports.report_date));
                return dateCmp !== 0 ? dateCmp : a.chunk_index - b.chunk_index;
              });
              const rows = sorted.map(({ _patientId, ...rest }) => rest);
              const chain = {
                order: () => chain,
                then: (resolve) => resolve({ data: rows, error: null, count: rows.length }),
              };
              return chain;
            },
          }),
        };
      }
      // 'reports' — used only by the retrieval path's citation join.
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({ data: retrieverReports, error: null }),
          }),
        }),
      };
    },
  };

  mock.module(new URL('../../rag/config/supabase.js', import.meta.url).href, {
    namedExports: { supabase: fakeSupabase },
  });

  mock.module(new URL('../../rag/config/aiClient.js', import.meta.url).href, {
    namedExports: {
      embedText: async () => {
        calls.embedText += 1;
        return new Array(768).fill(0);
      },
      embedTexts: async (texts) => texts.map(() => new Array(768).fill(0)),
      runAI: async ({ task }) => {
        if (task === 'generation') {
          // Deterministic structured JSON so parseStructuredAnswer has
          // something real to parse, rather than falling back to
          // plain-text — makes the excerpt-count assertions meaningful.
          return {
            ok: true,
            text: JSON.stringify({ headline: 'Mock answer.', keyFacts: [], caveat: '' }),
            model_used: 'mock',
            provider: 'mock',
            degraded: false,
          };
        }
        throw new Error(`unexpected runAI task in this test: ${task}`);
      },
      FRIENDLY_FALLBACK,
      EMBEDDING_MODEL: 'gemini-embedding-001',
      EMBEDDING_DIMENSIONS: 768,
    },
  });
}
