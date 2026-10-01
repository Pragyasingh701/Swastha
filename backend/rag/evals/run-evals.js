// Runs a set of eval questions through the REAL Ask Swastha pipeline
// against whatever DB backend/.env points at, and reports whether each
// one's expected reports/keywords actually showed up.
//
// Two modes (--mode flag, default conversational):
//   oneshot        - searchService.js's searchReports, the same one-shot
//                    path POST /rag/api/search uses. No session, no
//                    followups (a question's own "followups" array, if
//                    present, is ignored with a warning).
//   conversational - conversationalSearchService.js's conversationalSearch,
//                    the same path POST /rag/api/search/chat uses. Each
//                    top-level question gets a FRESH session id
//                    (crypto.randomUUID()); an optional "followups" array on
//                    a question runs each follow-up question in THAT SAME
//                    session, in order, each scored against its own
//                    expected_report_ids/must_contain.
//
// Deliberately reads from a GITIGNORED questions.local.json, never from
// this directory's own tracked questions.example.json — eval questions
// reference real patient_id/report_id values, and committing those would
// commit real patient data. See questions.example.json for the format, and
// the README's "Ask Swastha eval harness" section for how to run this.
//
// Usage:
//   node backend/rag/evals/run-evals.js
//   node backend/rag/evals/run-evals.js --mode=oneshot
//   node backend/rag/evals/run-evals.js --file=path/to/other-questions.json
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

const { searchReports } = await import('../services/searchService.js');
const { conversationalSearch } = await import('../services/conversationalSearchService.js');

const DEFAULT_QUESTIONS_FILE = new URL('./questions.local.json', import.meta.url);
const VALID_MODES = ['oneshot', 'conversational'];

function parseArgs(argv) {
  const fileArg = argv.find((a) => a.startsWith('--file='));
  const modeArg = argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'conversational';

  if (!VALID_MODES.includes(mode)) {
    console.error(`[run-evals] --mode must be one of: ${VALID_MODES.join(', ')} (got: ${mode})`);
    process.exit(1);
  }

  return { file: fileArg ? fileArg.slice('--file='.length) : null, mode };
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
 * Runs ONE turn (a top-level question, or one of its followups) through the
 * pipeline and scores it against its own expected_report_ids/must_contain.
 * Pipeline-shape-agnostic: `runPipeline` is always called as
 * `runPipeline(question, patientId)` — mode-specific concerns (session id,
 * conversationalSearch's object-arg shape) are handled by the caller
 * building the right `runPipeline` closure (see buildPipeline below).
 *
 * @param {{ question: string, expected_report_ids?: string[], must_contain?: string[] }} turn
 * @param {string} patientId
 * @param {(query: string, userId: string) => Promise<object>} runPipeline
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
async function runOneTurn(turn, patientId, runPipeline) {
  const { question, expected_report_ids: expectedReportIds = [], must_contain: mustContain = [] } = turn;
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

/**
 * Runs one eval case — the top-level question, then (conversational mode
 * only) each of its "followups" in order, in the SAME session. Exported so
 * it can be unit-tested against mocked pipeline output without needing a
 * real DB/AI call (see run-evals-unit.test.js).
 *
 * `runPipeline` is called once per turn as `runPipeline(question, patientId)`
 * — for conversational mode this must already be a closure bound to one
 * fixed session id for the whole eval case (see buildPipeline), so that
 * followups genuinely share a session with their parent question.
 *
 * @param {{ question: string, patient_id: string, expected_report_ids?: string[], must_contain?: string[], followups?: object[] }} evalCase
 * @param {(query: string, userId: string) => Promise<object>} runPipeline - defaults to one-shot searchReports
 * @param {{ mode?: 'oneshot'|'conversational' }} [options]
 * @returns {Promise<{ question: string, pass: boolean, turns: object[] }>}
 */
export async function runOneEval(evalCase, runPipeline = searchReports, { mode = 'oneshot' } = {}) {
  const { question, patient_id: patientId, followups = [] } = evalCase;

  if (mode === 'oneshot' && followups.length > 0) {
    console.warn(`[run-evals] "${question}" has followups, but --mode=oneshot has no session concept — ignoring them.`);
  }

  const turns = [await runOneTurn(evalCase, patientId, runPipeline)];

  if (mode === 'conversational') {
    for (const followup of followups) {
      // Sequential and awaited in order — a followup's whole point is
      // building on the conversation state the question(s) before it left
      // behind, so running them out of order (or concurrently) would test
      // something other than what "followup" means.
      // eslint-disable-next-line no-await-in-loop
      const turnResult = await runOneTurn(followup, patientId, runPipeline);
      turns.push(turnResult);
    }
  }

  return { question, pass: turns.every((t) => t.pass), turns };
}

function formatIssues(turn) {
  if (turn.error) return `error: ${turn.error}`;
  return (
    [
      turn.missingReportIds.length > 0 ? `missing reports: ${turn.missingReportIds.join(', ')}` : null,
      turn.missingKeywords.length > 0 ? `missing keywords: ${turn.missingKeywords.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('; ') || '-'
  );
}

function truncate(text, max = 50) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

/**
 * One row per eval case (task requirement: followups are nested under
 * their parent, not their own top-level rows). A failing case's Issues
 * column names which specific turn(s) failed and why, so a failure inside
 * a 3rd followup is still immediately locatable without needing per-turn
 * rows. Mode/Latency show the PARENT question's own turn — the parent is
 * what the case is keyed by; per-followup mode/latency lives in Issues for
 * a failing case (a passing case's followups are summarized as a count).
 */
function printSummaryTable(results) {
  const rows = results.map((r) => {
    const [parentTurn, ...followupTurns] = r.turns;
    const failingTurns = r.turns.filter((t) => !t.pass);

    let issues;
    if (r.pass) {
      issues = followupTurns.length > 0 ? `${followupTurns.length} followup(s), all passed` : '-';
    } else {
      issues = failingTurns
        .map((t, i) => {
          const label = t === parentTurn ? 'question' : `followup ${r.turns.indexOf(t)}`;
          return `[${label}] ${formatIssues(t)}`;
        })
        .join(' | ');
    }

    return {
      Question: truncate(r.question),
      Pass: r.pass ? 'PASS' : 'FAIL',
      Mode: parentTurn.mode || '-',
      'Latency (ms)': r.turns.reduce((sum, t) => sum + t.latencyMs, 0),
      Followups: followupTurns.length,
      Issues: issues,
    };
  });

  console.table(rows);

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\n${passCount}/${results.length} passed.`);
}

function buildPipeline(mode) {
  if (mode === 'oneshot') {
    return searchReports;
  }
  // Bound to a single fresh session id per eval CASE (not per turn) — every
  // followup call below reuses this same sessionId, which is what makes
  // them genuinely conversational rather than independent one-shot calls
  // that happen to be listed together.
  const sessionId = crypto.randomUUID();
  return (query, userId) => conversationalSearch({ query, userId, sessionId });
}

async function main() {
  const { file, mode } = parseArgs(process.argv.slice(2));
  const questions = await loadQuestions(file);

  console.log(`[run-evals] running ${questions.length} question(s) in --mode=${mode} against the real pipeline...`);

  const results = [];
  for (const evalCase of questions) {
    // Sequential, not parallel — this hits the same rate-limited AI
    // provider chain a real user would, and running evals concurrently
    // would just make them fail on rate limits instead of on real answer
    // quality. A fresh pipeline (and, for conversational mode, a fresh
    // session id) per eval case, so one question's followups never bleed
    // into another question's session.
    // eslint-disable-next-line no-await-in-loop
    const result = await runOneEval(evalCase, buildPipeline(mode), { mode });
    results.push(result);
  }

  printSummaryTable(results);

  const allPassed = results.every((r) => r.pass);
  process.exit(allPassed ? 0 : 1);
}

// Only auto-run when executed directly (`node run-evals.js`), not when
// imported by run-evals-unit.test.js for runOneEval/printSummaryTable.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
