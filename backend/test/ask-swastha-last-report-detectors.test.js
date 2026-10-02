// Unit tests for the "last report" / category / summary-request detector
// functions in searchService.js — added after a session of manual
// interaction testing found three live bugs in how these compose:
//   1. detectLastReportCategory (single-match) used where a multi-category
//      answer was needed, silently dropping whichever category wasn't
//      checked first ("summarize all my prescriptions and lab reports").
//   2. "except my lab reports" matched the Lab Report keyword like a normal
//      inclusion and answered ONLY about lab reports — the opposite of what
//      was asked.
//   3. A bare reference ("last report?", "my last report") had no verb for
//      isSummaryRequest to match, so it fell through to narrow-fact-lookup
//      prompt instructions and produced a field-restatement answer instead
//      of a real summary — while "any red flags in my last report" (a
//      genuinely narrower question) correctly needed to KEEP its tighter
//      answer, so the fix can't just broaden isSummaryRequest itself.
//
// These are pure, dependency-free regex/string functions — no DB, no AI
// call, no server — so a plain node:test run is enough; see
// ask-swastha-keyfacts-dedup.test.js for the same style on a sibling
// function in this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { __testing } = await import('../rag/services/searchService.js');
const {
  isAggregateQuestion,
  isLastReportQuestion,
  isSummaryRequest,
  isBareLastReportReference,
  detectLastReportCategory,
  detectAggregateCategories,
  isNegatedCategoryQuestion,
} = __testing;

test('isLastReportQuestion: matches singular last/latest/most recent phrasing', () => {
  assert.equal(isLastReportQuestion('summarize my last report'), true);
  assert.equal(isLastReportQuestion('Summarize their most recent lab results.'), true);
  assert.equal(isLastReportQuestion('what was my blood sugar level in my last report?'), true);
  assert.equal(isLastReportQuestion('summarize my latest test'), true);
});

test('isLastReportQuestion: does not match unrelated or plural whole-history phrasing', () => {
  assert.equal(isLastReportQuestion('what medicines am I currently prescribed'), false);
  assert.equal(isLastReportQuestion('has this patient had any drug allergies'), false);
  assert.equal(isLastReportQuestion('summarize my whole medical history'), false);
  assert.equal(isLastReportQuestion('summarize all my records'), false);
});

test('isLastReportQuestion: excludes compare/plural-count phrasing (fixed bug — answerLastReportQuestion only fetches ONE report)', () => {
  assert.equal(isLastReportQuestion('compare my last two lab reports'), false);
  assert.equal(isLastReportQuestion('compare my last report to the previous one'), false);
  assert.equal(isLastReportQuestion('what was in my last few reports'), false);
  // sanity: a genuinely singular question with "last" still matches
  assert.equal(isLastReportQuestion('is my last report different from before'), true);
});

test('detectLastReportCategory: resolves a single named category, first match wins', () => {
  assert.equal(detectLastReportCategory('summarize my last prescription'), 'Prescription');
  assert.equal(detectLastReportCategory('tell me about my last visit'), 'Consultation');
  assert.equal(detectLastReportCategory('when was my last vaccine'), 'Vaccination');
  assert.equal(detectLastReportCategory('tell me about my last scan'), 'Imaging');
  assert.equal(detectLastReportCategory('what was my last test result'), 'Lab Report');
});

test('detectLastReportCategory: returns null for generic phrasing (no category filter)', () => {
  assert.equal(detectLastReportCategory('summarize my last report'), null);
  assert.equal(detectLastReportCategory('summarize my last upload'), null);
  assert.equal(detectLastReportCategory('summarize my last document'), null);
});

test('detectAggregateCategories: returns EVERY matching category, not just the first (fixed bug)', () => {
  // The bug: "summarize all my prescriptions and lab reports" used to
  // resolve to Prescription only via the single-match function, silently
  // dropping the lab reports the patient explicitly asked about.
  assert.deepEqual(
    detectAggregateCategories('summarize all my prescriptions and lab reports'),
    ['Prescription', 'Lab Report']
  );
  assert.deepEqual(detectAggregateCategories('summarize all my prescriptions'), ['Prescription']);
  assert.deepEqual(detectAggregateCategories('how many reports do I have'), []);
});

test('isNegatedCategoryQuestion: detects except/excluding/not phrasing (fixed bug)', () => {
  // The bug: "except my lab reports" matched the Lab Report keyword like a
  // normal inclusion, so the answer ended up being ENTIRELY about lab
  // reports — the one thing the patient asked to leave out.
  assert.equal(isNegatedCategoryQuestion('summarize all my records except lab reports'), true);
  assert.equal(isNegatedCategoryQuestion('list everything excluding my prescriptions'), true);
  assert.equal(isNegatedCategoryQuestion('tell me about my records, not the lab stuff'), true);
});

test('isNegatedCategoryQuestion: does not fire on normal inclusion phrasing', () => {
  assert.equal(isNegatedCategoryQuestion('summarize my last report'), false);
  assert.equal(isNegatedCategoryQuestion('summarize all my prescriptions'), false);
});

test('isSummaryRequest: matches open-ended summarize-style phrasing including casual synonyms', () => {
  assert.equal(isSummaryRequest('summarize my last report'), true);
  assert.equal(isSummaryRequest('give me an overview of my last report'), true);
  assert.equal(isSummaryRequest("what's in my latest report"), true);
  assert.equal(isSummaryRequest('tell me about my last report'), true);
  assert.equal(isSummaryRequest('recap my last checkup'), true);
  assert.equal(isSummaryRequest('give me a rundown of my last report'), true);
  assert.equal(isSummaryRequest("what's going on with my last report"), true);
});

test('isSummaryRequest: does not match narrow fact or yes/no questions (these must keep their own tighter answer)', () => {
  assert.equal(isSummaryRequest('What was my blood sugar level in my last report?'), false);
  assert.equal(isSummaryRequest('what medicines was I prescribed in my last report'), false);
  assert.equal(isSummaryRequest('any red flags in my last report'), false);
  assert.equal(isSummaryRequest('is everything normal in my last report'), false);
});

test('isBareLastReportReference: true for a bare noun-phrase reference with no verb (fixed bug)', () => {
  // The bug: these got routed through narrow-fact-lookup prompt
  // instructions (no verb for isSummaryRequest to match) and produced a
  // field-restatement answer (Date/Title/Doctor/Hospital) identical to the
  // original turn-1 bug this whole feature was built to fix.
  assert.equal(isBareLastReportReference('last report?'), true);
  assert.equal(isBareLastReportReference('my last report'), true);
  assert.equal(isBareLastReportReference('LAST REPORT SUMMARY'), true);
  assert.equal(isBareLastReportReference('last prescription?'), true);
});

test('isBareLastReportReference: false for a question with its own real content (must NOT be forced into a full summary)', () => {
  assert.equal(isBareLastReportReference('any red flags in my last report'), false);
  assert.equal(isBareLastReportReference('is everything normal in my last report'), false);
  assert.equal(isBareLastReportReference('whats my last report say'), false);
  assert.equal(isBareLastReportReference('summarize my last prescription'), false);
  assert.equal(isBareLastReportReference('what was my blood sugar level in my last report?'), false);
  assert.equal(isBareLastReportReference('can u summarise my last report pls'), false);
});

test('isAggregateQuestion: unaffected by the category/negation additions (regression guard)', () => {
  assert.equal(isAggregateQuestion('how many reports do I have'), true);
  assert.equal(isAggregateQuestion('summarize my whole medical history'), true);
  assert.equal(isAggregateQuestion('summarize my last report'), false);
  assert.equal(isAggregateQuestion('has this patient had any drug allergies'), false);
});
