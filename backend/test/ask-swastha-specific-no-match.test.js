// Fix: buildGroundedPrompt used to instruct the model that whenever the
// excerpts didn't fully answer a question, it must fall back to one fixed
// sentence ("I couldn't find this information in your health records.")
// and was explicitly forbidden from giving any partial answer — even when
// the retrieved excerpts contained SOMETHING relevant (e.g. two
// prescriptions were retrieved as sources for "What medications was I
// prescribed for hypertension?", but the model gave the generic non-answer
// instead of describing what the prescriptions actually showed).
//
// This test proves the rigid, canned-sentence instruction is gone from the
// prompt, and that the new instruction requires the model to be specific:
// say what WAS found (in keyFacts) and explain the gap (in caveat) when the
// excerpts are only partially relevant, and to name the actual missing
// topic rather than a single generic phrase when nothing relevant exists.
//
// Kept in its own file, with no module mocking at all — see
// ask-swastha-specific-no-match-flow.test.js for the mocked end-to-end
// version (mock.module can't re-mock an already-mocked, or already
// unmocked-and-loaded, specifier within one process, so a plain content
// check on the real buildGroundedPrompt and a mocked full-flow test can't
// safely share a process).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

test('buildGroundedPrompt no longer instructs a single canned non-answer sentence', async () => {
  const { buildGroundedPrompt } = await import('../rag/services/searchService.js');

  const excerpts = [
    {
      index: 1,
      reportId: 'r1',
      title: 'Prescription',
      reportDate: '2024-11-04',
      text: 'Amlodipine 5mg once daily. Telmisartan 40mg once daily.',
      similarity: 0.7,
    },
  ];

  const prompt = buildGroundedPrompt('What medications was I prescribed for hypertension?', excerpts);

  // The old rigid fallback must be gone.
  assert.ok(
    !prompt.includes('set "headline" to "I couldn\'t find this information in your health records."'),
    'the old one-size-fits-all canned sentence instruction must be removed'
  );
  assert.ok(
    !prompt.includes('Do not attempt a partial or speculative answer'),
    'the old blanket ban on partial answers must be removed'
  );

  // The new instruction must require specificity for both failure shapes:
  // nothing relevant at all, vs. something relevant but incomplete.
  assert.match(prompt, /NOTHING relevant/i, 'must instruct the model to say so specifically when nothing matches');
  assert.match(
    prompt,
    /SOMETHING related but not a complete or exact answer/i,
    'must instruct the model to describe partial matches instead of giving up'
  );
  assert.match(prompt, /keyFacts/, 'must direct partial matches into keyFacts');
  assert.match(prompt, /caveat.*explain/i, 'must direct the gap explanation into caveat');
  assert.match(
    prompt,
    /[Nn]ever\b.*invent/,
    'the safety rule against inventing/guessing facts must still be present and enforced'
  );
  assert.match(
    prompt,
    /specific to what was actually asked/i,
    'must explicitly forbid a generic, one-size-fits-all non-answer'
  );
});
