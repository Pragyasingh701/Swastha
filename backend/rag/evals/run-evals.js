// Runs a set of eval questions through the REAL Ask Swastha pipeline
// (searchService.js's searchReports — the same one-shot path POST
// /rag/api/search uses) against whatever DB backend/.env points at, and
// reports whether each one's expected reports/keywords actually showed up.
//
// Deliberately reads from a GITIGNORED questions.local.json, never from
// this directory's own tracked questions.example.json — eval questions
// reference real patient_id/report_id values, and committing those would
// commit real patient data. See questions.example.json for the format, and
// the README's "Ask Swastha eval harness" section for how to run this.
//
// Usage:
//   node backend/rag/evals/run-evals.js
//   node backend/rag/evals/run-evals.js --file=path/to/other-questions.json
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

const { searchReports } = await import('../services/searchService.js');

const DEFAULT_QUESTIONS_FILE = new URL('./questions.local.json', import.meta.url);

function parseArgs(argv) {
  const fileArg = argv.find((a) => a.startsWith('--file='));
  return { file: fileArg ? fileArg.slice('--file='.length) : null };
}

async function loadQuestions(filePath) {
  const url = filePath ? new URL(filePath, `file://${process.cwd()}/`) : DEFAULT_QUESTIONS_FILE;
  const fs = await import('node:fs/promises');
  let raw;
  try {
    raw = await fs.readFile(url, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(
        `[run-evals] questions file not found: ${url.pathname}\n` +
          '  Copy backend/rag/evals/questions.example.json to backend/rag/evals/questions.local.json ' +
          '(gitignored) and fill in real patient_id/report_id values, or pass --file=<path>.'
      );
      process.exit(1);
    }
    throw err;
  }

  const questions = JSON.parse(raw);
  if (!Array.isArray(questions) || questions.length === 0) {
    console.error('[run-evals] questions file must be a non-empty JSON array.');
    process.exit(1);
  }
  return questions;
}

/**
 * Runs one eval question through the real pipeline and scores it.
 * Exported so it can be unit-tested against mocked pipeline output without
 * needing a real DB/AI call (see run-evals.test.js).
 *
 * @param {{ question: string, patient_id: string, expected_report_ids?: string[], must_contain?: string[] }} evalCase
 * @param {(query: string, userId: string) => Promise<object>} runPipeline - defaults to searchReports
 * @returns {Promise<{
 *   question: string,
 *   pass: boolean,
 *   mode: string|null,
 *   latencyMs: number,
 *   missingReportIds: string[],
 *   missingKeywords: string[],
 *   error: string|null,
 * }>}
 */
export async function runOneEval(evalCase, runPipeline = searchReports) {
  const { question, patient_id: patientId, expected_report_ids: expectedReportIds = [], must_contain: mustContain = [] } = evalCase;
  const startedAt = Date.now();

  let result;
  let error = null;
  try {
    result = await runPipeline(question, patientId);
  } catch (err) {
    error = err.message;
  }
  const latencyMs = Date.now() - startedAt;

  if (error) {
    return { question, pass: false, mode: null, latencyMs, missingReportIds: expectedReportIds, missingKeywords: mustContain, error };
  }

  const returnedReportIds = new Set((result.sources || []).map((s) => String(s.report_id)));
  const missingReportIds = expectedReportIds.filter((id) => !returnedReportIds.has(String(id)));

  const answerText = String(result.answer || '').toLowerCase();
  const missingKeywords = mustContain.filter((phrase) => !answerText.includes(String(phrase).toLowerCase()));

  const pass = missingReportIds.length === 0 && missingKeywords.length === 0;

  return {
    question,
    pass,
    mode: result.mode || null,
    latencyMs,
    missingReportIds,
    missingKeywords,
    error: null,
  };
}

function printSummaryTable(results) {
  const rows = results.map((r) => ({
    Question: r.question.length > 50 ? `${r.question.slice(0, 47)}...` : r.question,
    Pass: r.pass ? 'PASS' : 'FAIL',
    Mode: r.mode || '-',
    'Latency (ms)': r.latencyMs,
    Issues: r.error
      ? `error: ${r.error}`
      : [
          r.missingReportIds.length > 0 ? `missing reports: ${r.missingReportIds.join(', ')}` : null,
          r.missingKeywords.length > 0 ? `missing keywords: ${r.missingKeywords.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join('; ') || '-',
  }));

  console.table(rows);

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${results.length} passed.`);
}

async function main() {
  const { file } = parseArgs(process.argv.slice(2));
  const questions = await loadQuestions(file);

  console.log(`[run-evals] running ${questions.length} question(s) against the real pipeline...`);

  const results = [];
  for (const evalCase of questions) {
    // Sequential, not parallel — this hits the same rate-limited AI
    // provider chain a real user would, and running evals concurrently
    // would just make them fail on rate limits instead of on real answer
    // quality.
    // eslint-disable-next-line no-await-in-loop
    const result = await runOneEval(evalCase);
    results.push(result);
  }

  printSummaryTable(results);

  const allPassed = results.every((r) => r.pass);
  process.exit(allPassed ? 0 : 1);
}

// Only auto-run when executed directly (`node run-evals.js`), not when
// imported by run-evals.test.js for runOneEval/printSummaryTable.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
