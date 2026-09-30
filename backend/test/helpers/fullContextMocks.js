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
 * Builds a fake `reports` row shaped exactly like the real
 * .select('id, title, report_date, category, hospital, doctor, diagnosis,
 * medicines, notes, file_url') that loadPatientReportsForPrompt performs —
 * full-context mode now reads reports directly, not report_embeddings.
 * `_patientId` is test-only bookkeeping, stripped before the mock "returns"
 * a row (the real query filters by patient_id but doesn't select it back).
 */
export function reportRow({
  patientId,
  reportId,
  title = 'Fake Report',
  reportDate,
  category = 'Consultation',
  hospital = null,
  doctor = null,
  diagnosis = null,
  medicines = null,
  notes = null,
  fileUrl = null,
}) {
  return {
    _patientId: patientId,
    id: reportId,
    title,
    report_date: reportDate,
    category,
    hospital,
    doctor,
    diagnosis,
    medicines,
    notes,
    file_url: fileUrl,
  };
}

/**
 * Installs both mocked modules conversationalSearch depends on before
 * generation: the Supabase client (whose `reports` query actually respects
 * .eq('patient_id', ...) — real patient scoping, not a canned response —
 * and returns rows sorted by report_date then id, same as the real
 * .order().order() chain would) and the AI failover client
 * (embedText/runAI). `calls` gets `.embedText`/`.rpc` counters bumped on
 * every real invocation, so a test can assert full-context mode genuinely
 * skipped them, not just assert on the final answer shape.
 *
 * Must be called at most once per process (each of the 3 test files calls
 * it exactly once, at module scope or inside its single test()).
 */
export function installFullContextMocks({
  allReportRows,
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
      if (table === 'reports') {
        return {
          select: () => ({
            eq: (col, val) => {
              const filtered = allReportRows.filter((r) => r._patientId === val);
              const sorted = [...filtered].sort((a, b) => {
                const dateCmp = String(a.report_date).localeCompare(String(b.report_date));
                return dateCmp !== 0 ? dateCmp : String(a.id).localeCompare(String(b.id));
              });
              const rows = sorted.map(({ _patientId, ...rest }) => rest);
              const chain = {
                order: () => chain,
                then: (resolve) => resolve({ data: rows, error: null }),
                // Also usable for the retrieval path's citation join
                // (.select().eq().in()), which doesn't chain .order().
                in: async () => ({ data: retrieverReports, error: null }),
              };
              return chain;
            },
          }),
        };
      }
      // Anything else (unused in these tests, but kept safe) falls through
      // to the retrieval-path citation join shape.
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
