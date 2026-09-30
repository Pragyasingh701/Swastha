// markInapplicableHpiFields stamps site/radiation with an internal
// completion marker for a systemic complaint (fatigue, fever, etc.) — the
// intake conversation's own state machine (hpiComplete()/capturedFieldKeys())
// needs that marker to know the HPI section is done and to stop the model
// from asking a nonsensical "where is your fatigue located" question.
//
// hpi_na_fields is the SEPARATE, display-oriented signal added alongside
// that marker: a plain list of which hpi keys were stamped rather than
// genuinely answered by the patient, so a consumer (the doctor's intake
// summary UI) can tell "structurally not applicable" apart from "a real
// patient answer" without needing to know or match against the internal
// marker string itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const { __testing, emptyStructuredHistory, hpiComplete } = await import('../rag/services/intakeService.js');
const { markInapplicableHpiFields } = __testing;

test('a systemic complaint gets site/radiation marked N/A and listed in hpi_na_fields', () => {
  const history = { ...emptyStructuredHistory(), chief_complaint: 'Fatigue and low energy' };

  const result = markInapplicableHpiFields(history);

  assert.equal(typeof result.hpi.site, 'string');
  assert.ok(result.hpi.site.length > 0, 'site must be non-empty so hpiComplete() can eventually pass');
  assert.equal(typeof result.hpi.radiation, 'string');
  assert.ok(result.hpi.radiation.length > 0);
  assert.deepEqual([...result.hpi_na_fields].sort(), ['radiation', 'site']);
});

test('a localized complaint (mentions a body part) does NOT mark site/radiation N/A', () => {
  const history = { ...emptyStructuredHistory(), chief_complaint: 'Pain in right knee' };

  const result = markInapplicableHpiFields(history);

  assert.equal(result.hpi.site, '', 'site must stay empty — this complaint is localized and should be asked normally');
  assert.equal(result.hpi.radiation, '');
  assert.equal(result, history, 'an unmarked history should be returned unchanged, not a new object');
});

test('a field the patient had already genuinely answered before being marked systemic is NOT listed as N/A', () => {
  const history = {
    ...emptyStructuredHistory(),
    chief_complaint: 'Fatigue',
    hpi: { ...emptyStructuredHistory().hpi, site: 'Lower back' }, // a real prior answer, somehow already captured
  };

  const result = markInapplicableHpiFields(history);

  assert.equal(result.hpi.site, 'Lower back', "a real prior answer must never be overwritten by the N/A marker");
  // Only radiation was actually newly marked — site was left alone because
  // it already held a real answer, so it must not appear in hpi_na_fields.
  assert.deepEqual(result.hpi_na_fields, ['radiation']);
});

test('calling markInapplicableHpiFields twice does not duplicate entries in hpi_na_fields', () => {
  const history = { ...emptyStructuredHistory(), chief_complaint: 'Fever and chills' };

  const once = markInapplicableHpiFields(history);
  const twice = markInapplicableHpiFields(once);

  assert.deepEqual([...twice.hpi_na_fields].sort(), ['radiation', 'site']);
});

test('the N/A marker still satisfies hpiComplete() once every other field is filled', () => {
  const history = {
    ...emptyStructuredHistory(),
    chief_complaint: 'Fatigue',
    hpi: {
      ...emptyStructuredHistory().hpi,
      onset: 'Since last week',
      character: 'Constant tiredness',
      associated_symptoms: [],
      timing: 'All day',
      exacerbating_relieving: 'Worse after work',
      severity: 6,
    },
  };

  const marked = markInapplicableHpiFields(history);

  assert.equal(hpiComplete(marked.hpi), true, 'hpiComplete() must still treat the N/A marker as a filled field');
});

test('the model verdict (is_systemic_complaint) is honored over the term-list fallback', () => {
  // "cough" matches no systemic term and mentions no body part either way —
  // this exercises that an explicit model verdict of true still marks the
  // fields even when the term-list fallback alone would not have.
  const history = { ...emptyStructuredHistory(), chief_complaint: 'Persistent cough' };

  const withoutVerdict = markInapplicableHpiFields(history);
  assert.equal(withoutVerdict, history, 'the term-list fallback alone must not classify "cough" as systemic');

  const withVerdict = markInapplicableHpiFields(history, true);
  assert.deepEqual([...withVerdict.hpi_na_fields].sort(), ['radiation', 'site']);
});
