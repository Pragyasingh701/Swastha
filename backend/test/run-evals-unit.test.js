// Part 4 of the eval harness: unit tests for run-evals.js's pass/fail
// scoring logic (runOneEval), using mocked pipeline output — no real DB or
// AI call, and NOT run against production data, per the task's explicit
// instruction not to run the eval script against production data as part
// of this work.
//
// runOneEval returns { question, pass, turns } — turns[0] is always the
// top-level question; turns[1+] are its followups (conversational mode
// only). `pass` is true only when every turn passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOneEval } from '../rag/evals/run-evals.js';

test('passes when every expected report id and must_contain keyword is present', async () => {
  const evalCase = {
    question: 'What medicines is this patient on?',
    patient_id: 'usr_1',
    expected_report_ids: ['r1', 'r2'],
    must_contain: ['Metformin'],
  };
  const mockPipeline = async () => ({
    answer: 'The patient is on Metformin 500mg twice daily.',
    sources: [{ report_id: 'r1' }, { report_id: 'r2' }, { report_id: 'r3' }],
    mode: 'retrieval',
  });

  const result = await runOneEval(evalCase, mockPipeline);

  assert.equal(result.pass, true);
  assert.equal(result.turns.length, 1);
  const [turn] = result.turns;
  assert.equal(turn.mode, 'retrieval');
  assert.deepEqual(turn.missingReportIds, []);
  assert.deepEqual(turn.missingKeywords, []);
  assert.equal(turn.error, null);
  assert.ok(typeof turn.latencyMs === 'number' && turn.latencyMs >= 0);
});

test('fails and reports which expected report ids are missing', async () => {
  const evalCase = {
    question: 'Summarize the lab results.',
    patient_id: 'usr_2',
    expected_report_ids: ['r1', 'r2'],
  };
  const mockPipeline = async () => ({
    answer: 'Here is a summary.',
    sources: [{ report_id: 'r1' }], // r2 missing
    mode: 'retrieval',
  });

  const result = await runOneEval(evalCase, mockPipeline);

  assert.equal(result.pass, false);
  assert.deepEqual(result.turns[0].missingReportIds, ['r2']);
  assert.deepEqual(result.turns[0].missingKeywords, []);
});

test('fails and reports which must_contain keywords are missing (case-insensitive)', async () => {
  const evalCase = {
    question: 'What is the diagnosis?',
    patient_id: 'usr_3',
    must_contain: ['Hypertension', 'Diabetes'],
  };
  const mockPipeline = async () => ({
    answer: 'The patient has hypertension.', // "Diabetes" missing; "hypertension" matches case-insensitively
    sources: [],
    mode: 'aggregate',
  });

  const result = await runOneEval(evalCase, mockPipeline);

  assert.equal(result.pass, false);
  assert.deepEqual(result.turns[0].missingKeywords, ['Diabetes']);
});

test('passes when expected_report_ids and must_contain are both omitted (no checks to fail)', async () => {
  const evalCase = { question: 'How many reports are on file?', patient_id: 'usr_4' };
  const mockPipeline = async () => ({ answer: 'There are 3 reports on file.', sources: [], mode: 'aggregate' });

  const result = await runOneEval(evalCase, mockPipeline);

  assert.equal(result.pass, true);
});

test('a pipeline error fails the eval and reports the error, not a crash', async () => {
  const evalCase = {
    question: 'What are the allergies?',
    patient_id: 'usr_5',
    expected_report_ids: ['r1'],
    must_contain: ['penicillin'],
  };
  const mockPipeline = async () => {
    throw new Error('simulated pipeline failure');
  };

  const result = await runOneEval(evalCase, mockPipeline);

  assert.equal(result.pass, false);
  const [turn] = result.turns;
  assert.equal(turn.error, 'simulated pipeline failure');
  assert.equal(turn.mode, null);
  // On an error, nothing was checked, so both are reported as fully missing
  // (an honest "everything this question needed is unverified", not a
  // false pass and not an empty/misleading missing list).
  assert.deepEqual(turn.missingReportIds, ['r1']);
  assert.deepEqual(turn.missingKeywords, ['penicillin']);
});

test('report id comparison tolerates a numeric vs string id mismatch', async () => {
  const evalCase = {
    question: 'What was found in the imaging report?',
    patient_id: 'usr_6',
    expected_report_ids: [42],
  };
  const mockPipeline = async () => ({
    answer: 'No acute findings.',
    sources: [{ report_id: '42' }],
    mode: 'retrieval',
  });

  const result = await runOneEval(evalCase, mockPipeline);

  assert.equal(result.pass, true, 'expected_report_ids and returned report_id should compare as strings');
});

test('conversational mode runs followups in order and reports one turn per followup', async () => {
  const calls = [];
  const evalCase = {
    question: 'What medicines is this patient on?',
    patient_id: 'usr_7',
    must_contain: ['Metformin'],
    followups: [
      { question: 'Are any of those a controlled substance?', must_contain: ['no'] },
      { question: 'What dosage were they prescribed?', must_contain: ['500mg'] },
    ],
  };
  const mockPipeline = async (query) => {
    calls.push(query);
    const answers = {
      'What medicines is this patient on?': 'The patient is on Metformin.',
      'Are any of those a controlled substance?': 'No, Metformin is not a controlled substance.',
      'What dosage were they prescribed?': 'They were prescribed 500mg twice daily.',
    };
    return { answer: answers[query], sources: [], mode: 'retrieval' };
  };

  const result = await runOneEval(evalCase, mockPipeline, { mode: 'conversational' });

  assert.equal(result.pass, true);
  assert.equal(result.turns.length, 3);
  assert.deepEqual(calls, [
    'What medicines is this patient on?',
    'Are any of those a controlled substance?',
    'What dosage were they prescribed?',
  ]);
});

test('conversational mode: a failing followup fails the whole eval case, independent of the parent question', async () => {
  const evalCase = {
    question: 'What medicines is this patient on?',
    patient_id: 'usr_8',
    must_contain: ['Metformin'], // parent passes
    followups: [{ question: 'What dosage?', must_contain: ['1000mg'] }], // followup fails
  };
  const mockPipeline = async (query) => {
    if (query === 'What dosage?') return { answer: 'They take 500mg.', sources: [], mode: 'retrieval' };
    return { answer: 'The patient is on Metformin.', sources: [], mode: 'retrieval' };
  };

  const result = await runOneEval(evalCase, mockPipeline, { mode: 'conversational' });

  assert.equal(result.pass, false);
  assert.equal(result.turns[0].pass, true, 'the parent question itself should still be reported as passing');
  assert.equal(result.turns[1].pass, false);
  assert.deepEqual(result.turns[1].missingKeywords, ['1000mg']);
});

test('oneshot mode ignores followups entirely (only the parent question runs)', async () => {
  const calls = [];
  const evalCase = {
    question: 'How many reports are on file?',
    patient_id: 'usr_9',
    followups: [{ question: 'This should never run.' }],
  };
  const mockPipeline = async (query) => {
    calls.push(query);
    return { answer: '3 reports.', sources: [], mode: 'aggregate' };
  };

  const result = await runOneEval(evalCase, mockPipeline, { mode: 'oneshot' });

  assert.equal(result.turns.length, 1);
  assert.deepEqual(calls, ['How many reports are on file?']);
});

test('defaults to oneshot mode (no followups run) when no mode option is given', async () => {
  const calls = [];
  const evalCase = {
    question: 'How many reports are on file?',
    patient_id: 'usr_10',
    followups: [{ question: 'This should never run.' }],
  };
  const mockPipeline = async (query) => {
    calls.push(query);
    return { answer: '3 reports.', sources: [], mode: 'aggregate' };
  };

  const result = await runOneEval(evalCase, mockPipeline);

  assert.equal(result.turns.length, 1);
  assert.deepEqual(calls, ['How many reports are on file?']);
});
