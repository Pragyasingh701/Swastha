// Intake question improvements: a new optional "vegetarian or
// non-vegetarian" question (drug_allergy.dietary_preference), since some
// vitamin/supplement tablets contain fish oil or other animal-derived
// ingredients — clinically relevant but never required to finish the
// section (same treatment as the existing `notes` field).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { __testing, emptyStructuredHistory } = await import('../rag/services/intakeService.js');
const { mergeStructuredHistory, capturedFieldKeys, drugAllergyFieldForQuestion, drugAllergyComplete } = __testing;

test('emptyStructuredHistory includes an empty dietary_preference field', () => {
  const history = emptyStructuredHistory();
  assert.equal(history.drug_allergy.dietary_preference, '');
});

test('mergeStructuredHistory persists a dietary_preference answer from updated_fields', () => {
  const history = emptyStructuredHistory();
  const merged = mergeStructuredHistory(history, {
    drug_allergy: { dietary_preference: 'Vegetarian' },
  });

  assert.equal(merged.drug_allergy.dietary_preference, 'Vegetarian');
  // Existing fields in the same nested object must be untouched by a
  // partial update.
  assert.deepEqual(merged.drug_allergy.current_medications, []);
  assert.deepEqual(merged.drug_allergy.allergies, []);
});

test('drugAllergyComplete() does NOT require dietary_preference to be set', () => {
  const drugAllergy = {
    current_medications: ['None'],
    allergies: ['No known allergies'],
    notes: '',
    dietary_preference: '', // never asked/answered
  };

  assert.equal(
    drugAllergyComplete(drugAllergy),
    true,
    'the section must be able to complete even if dietary_preference was never captured'
  );
});

test('capturedFieldKeys lists drug_allergy.dietary_preference once it has an answer, for dedup protection', () => {
  const history = emptyStructuredHistory();
  const before = capturedFieldKeys(history);
  assert.ok(!before.includes('drug_allergy.dietary_preference'));

  const merged = mergeStructuredHistory(history, { drug_allergy: { dietary_preference: 'Non-vegetarian' } });
  const after = capturedFieldKeys(merged);
  assert.ok(after.includes('drug_allergy.dietary_preference'), 'once answered, it must appear in the ALREADY ANSWERED list');
});

test('drugAllergyFieldForQuestion recognizes a diet question by keyword', () => {
  assert.equal(drugAllergyFieldForQuestion('Are you vegetarian or non-vegetarian?'), 'dietary_preference');
  assert.equal(drugAllergyFieldForQuestion('What is your diet preference?'), 'dietary_preference');
  // Unrelated questions must not false-match.
  assert.equal(drugAllergyFieldForQuestion('Are you currently taking any medications?'), 'current_medications');
  assert.equal(drugAllergyFieldForQuestion('Do you have any known drug or food allergies?'), 'allergies');
});

test("medications and allergies fallback options offer \"I don't remember\" instead of \"Not sure\"", async () => {
  const { questionSpecForField } = __testing;
  const history = emptyStructuredHistory();

  const medsSpec = questionSpecForField('current_medications', history, 'en-IN');
  assert.ok(medsSpec.options.includes("I don't remember"));
  assert.ok(!medsSpec.options.includes('Not sure'));

  const allergySpec = questionSpecForField('allergies', history, 'en-IN');
  assert.ok(allergySpec.options.includes("I don't remember"));
  assert.ok(!allergySpec.options.includes('Not sure'));
});

test('an "I don\'t remember" answer still satisfies drugAllergyComplete() like any other non-empty answer', () => {
  const drugAllergy = {
    current_medications: ["I don't remember"],
    allergies: ["I don't remember"],
    notes: '',
    dietary_preference: '',
  };

  assert.equal(drugAllergyComplete(drugAllergy), true);
});

test('the dietary_preference fallback question has English and Hindi variants', () => {
  const { questionSpecForField } = __testing;
  const history = emptyStructuredHistory();

  const en = questionSpecForField('dietary_preference', history, 'en-IN');
  assert.match(en.question, /vegetarian/i);
  assert.ok(en.options.length > 0);

  const hi = questionSpecForField('dietary_preference', history, 'hi-IN');
  assert.match(hi.question, /शाकाहारी/);
});

test('the drug_allergy section prompt instructs the model to ask what medicine/allergy on an unqualified yes, and to ask the diet question', () => {
  const { buildSystemPrompt } = __testing;
  const history = emptyStructuredHistory();

  const prompt = buildSystemPrompt('drug_allergy', history, null, 'en-IN');

  assert.match(
    prompt,
    /unqualified yes with no specific name given/i,
    'must instruct a follow-up when the patient gives a bare yes with no medicine/allergy name'
  );
  assert.match(prompt, /What medicine is it/i);
  assert.match(prompt, /What are you allergic to/i);
  assert.match(
    prompt,
    /do not ask the follow-up/i,
    'must instruct skipping the follow-up when the patient already named it in their first answer'
  );
  assert.match(prompt, /vegetarian or non-vegetarian/i, 'must instruct asking the new diet question');
  assert.match(prompt, /fish oil/i, 'must explain why diet matters, so the model understands this isn\'t idle chat');
  assert.match(
    prompt,
    /optional and never blocks section_complete/i,
    'must make clear the diet question is optional, unlike current_medications/allergies'
  );
});
