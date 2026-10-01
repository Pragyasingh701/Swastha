// Fix: a grounded answer could list the same fact twice in "keyFacts" when
// the same information appeared in more than one retrieved excerpt (e.g.
// two chunks from the same report both mentioning "Report Date: 11 Aug
// 2026" — the model listed it once per excerpt instead of once overall).
// parseStructuredAnswer now deterministically drops a duplicate rather than
// relying solely on the prompt instruction (which a free-tier model can and
// does ignore) — see buildGroundedPrompt's own new rule for the
// probabilistic half of this fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('parseStructuredAnswer drops a keyFacts entry that duplicates an earlier one (same label+detail)', async () => {
  const { parseStructuredAnswer } = await import('../rag/services/searchService.js');

  const excerpts = [
    { index: 1, reportId: 'r1', title: 'Comprehensive Health Screening Report', reportDate: '2026-08-11', text: '...', similarity: 0.9 },
    { index: 2, reportId: 'r1', title: 'Comprehensive Health Screening Report', reportDate: '2026-08-11', text: '...', similarity: 0.85 },
  ];

  const raw = JSON.stringify({
    headline: 'Your most recent blood test records provided are dated August 11, 2026.',
    keyFacts: [
      { label: 'Report Date', detail: '11 Aug 2026 (Comprehensive Health Screening Report)', excerpt: 1 },
      { label: 'Report Date', detail: '11 Aug 2026 (Comprehensive Health Screening Report)', excerpt: 2 },
    ],
    caveat: '',
  });

  const result = parseStructuredAnswer(raw, excerpts);

  assert.equal(result.keyFacts.length, 1, 'the second, duplicate keyFacts entry must be dropped');
  assert.equal(result.keyFacts[0].detail, '11 Aug 2026 (Comprehensive Health Screening Report)');
});

test('dedup is case- and whitespace-insensitive', async () => {
  const { parseStructuredAnswer } = await import('../rag/services/searchService.js');

  const raw = JSON.stringify({
    headline: 'Test.',
    keyFacts: [
      { label: 'Medicine', detail: 'Amlodipine 5mg', excerpt: 1 },
      { label: '  medicine  ', detail: '  AMLODIPINE 5MG  ', excerpt: 2 },
    ],
    caveat: '',
  });

  const result = parseStructuredAnswer(raw, [
    { index: 1, reportId: 'r1', title: 'A', reportDate: null, text: '', similarity: 0.9 },
    { index: 2, reportId: 'r2', title: 'B', reportDate: null, text: '', similarity: 0.9 },
  ]);

  assert.equal(result.keyFacts.length, 1, 'a duplicate differing only in case/whitespace must still be dropped');
});

test('distinct facts (different label or different detail) are both kept', async () => {
  const { parseStructuredAnswer } = await import('../rag/services/searchService.js');

  const raw = JSON.stringify({
    headline: 'Test.',
    keyFacts: [
      { label: 'Medicine', detail: 'Amlodipine 5mg', excerpt: 1 },
      { label: 'Medicine', detail: 'Telmisartan 40mg', excerpt: 1 }, // different detail, same label
      { label: 'Dosage', detail: 'Amlodipine 5mg', excerpt: 1 }, // same detail, different label
    ],
    caveat: '',
  });

  const result = parseStructuredAnswer(raw, [
    { index: 1, reportId: 'r1', title: 'A', reportDate: null, text: '', similarity: 0.9 },
  ]);

  assert.equal(result.keyFacts.length, 3, 'facts that differ in label or detail must never be treated as duplicates');
});

test('buildGroundedPrompt instructs against duplicate keyFacts and a redundant caveat', async () => {
  const { buildGroundedPrompt } = await import('../rag/services/searchService.js');

  const prompt = buildGroundedPrompt('When was my last blood test?', [
    { index: 1, reportId: 'r1', title: 'Report', reportDate: '2026-08-11', text: 'Report Date: 11 Aug 2026', similarity: 0.9 },
  ]);

  assert.match(prompt, /ONLY ONCE/, 'must instruct against listing the same fact from multiple excerpts');
  assert.match(
    prompt,
    /caveat.*must add something genuinely NEW/is,
    'must instruct that caveat must add new information, not restate the headline'
  );
  assert.match(
    prompt,
    /[Nn]ever use "caveat" to just restate or rephrase the headline/,
    'must explicitly forbid a caveat that just repeats the headline'
  );
});
