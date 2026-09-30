// Part 4 of the eval harness: unit tests for run-evals.js's pass/fail
// scoring logic (runOneEval), using mocked pipeline output — no real DB or
// AI call, and NOT run against production data, per the task's explicit
// instruction not to run the eval script against production data as part
// of this work.
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
  assert.equal(result.mode, 'retrieval');
  assert.deepEqual(result.missingReportIds, []);
  assert.deepEqual(result.missingKeywords, []);
  assert.equal(result.error, null);
  assert.ok(typeof result.latencyMs === 'number' && result.latencyMs >= 0);
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
  assert.deepEqual(result.missingReportIds, ['r2']);
  assert.deepEqual(result.missingKeywords, []);
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
  assert.deepEqual(result.missingKeywords, ['Diabetes']);
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
  assert.equal(result.error, 'simulated pipeline failure');
  assert.equal(result.mode, null);
  // On an error, nothing was checked, so both are reported as fully missing
  // (an honest "everything this question needed is unverified", not a
  // false pass and not an empty/misleading missing list).
  assert.deepEqual(result.missingReportIds, ['r1']);
  assert.deepEqual(result.missingKeywords, ['penicillin']);
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
