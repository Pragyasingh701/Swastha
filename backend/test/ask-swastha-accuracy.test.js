// Ask Swastha accuracy: (1) the AI summary stored inside a report's notes is not record text,
// (2) "my total cholesterol in the latest report" picks the latest LAB report, not the latest
// report of any kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { stripAiAnalysis, splitStoredNotes } = await import('../utils/reportNotes.js');
const { __testing } = await import('../rag/services/searchService.js');
const { detectLastReportCategory, detectAggregateCategories, isLastReportQuestion, isAggregateQuestion } = __testing;

test('stripAiAnalysis keeps what was written in the record and drops the AI summary', () => {
  assert.equal(stripAiAnalysis('Fasting sample.\n\n[AI Analysis]\nCholesterol looks high.'), 'Fasting sample.');
  assert.equal(stripAiAnalysis('[AI Analysis]\nOnly a summary.'), '');
  assert.equal(stripAiAnalysis('Plain notes'), 'Plain notes');
  assert.equal(stripAiAnalysis(null), '');
  assert.equal(stripAiAnalysis(''), '');
});

test('splitStoredNotes separates the notes from the analysis', () => {
  assert.deepEqual(splitStoredNotes('a\n\n[AI Analysis]\nb'), { notes: 'a', analysis: 'b' });
  assert.deepEqual(splitStoredNotes('[AI Analysis]\nb'), { notes: '', analysis: 'b' });
  assert.deepEqual(splitStoredNotes('a'), { notes: 'a', analysis: '' });
});

test('a question about a named test resolves to the latest Lab Report', () => {
  for (const q of [
    "What's my total cholesterol in the latest report?",
    'what was my hba1c in my last report',
    'my most recent report haemoglobin value',
    'latest report triglycerides',
    'my last report thyroid TSH',
  ]) {
    assert.equal(isLastReportQuestion(q), true, q);
    assert.equal(detectLastReportCategory(q), 'Lab Report', q);
  }
});

test('a question about medicines resolves to the latest Prescription', () => {
  assert.equal(detectLastReportCategory('what medicines are in my latest report'), 'Prescription');
  assert.equal(detectLastReportCategory('dosage in my last report'), 'Prescription');
});

test('existing category words still win as before', () => {
  assert.equal(detectLastReportCategory('summarize my last prescription'), 'Prescription');
  assert.equal(detectLastReportCategory('my last x-ray'), 'Imaging');
  assert.equal(detectLastReportCategory('my last report'), null);
  assert.deepEqual(detectAggregateCategories('summarize all my prescriptions and lab reports'), ['Prescription', 'Lab Report']);
});

test('"total" and "count" about a value in one report are not a "how many reports" question', () => {
  for (const q of ["What's my total cholesterol in the latest report?", 'blood count in my last report', 'total bilirubin in the latest report']) {
    assert.equal(isAggregateQuestion(q), false, q);
    assert.equal(isLastReportQuestion(q), true, q);
  }
});

test('real count and list questions still go to the whole-history path', () => {
  for (const q of ['how many reports do I have', 'total number of reports', 'count my reports', 'total reports', 'list all my reports', 'number of prescriptions', 'why only 5']) {
    assert.equal(isAggregateQuestion(q), true, q);
  }
});
