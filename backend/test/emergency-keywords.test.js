// The keyword emergency check (rag/services/emergencyKeywords.js) catches dangerous
// messages in English, Hindi and Hinglish without the AI, and only ever points at
// India's 112, 108 and 102.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectEmergency } from '../rag/services/emergencyKeywords.js';

const numbersOf = (r) => r.numbers.map((n) => n.number);

const SHOULD_FLAG = [
  // [message, category]
  ['I have severe chest pain and sweating', 'chest'],
  ['my chest hurts a lot', 'chest'],
  ['मेरे दिल में दर्द है', 'chest'],
  ['breathless and sweating', 'breathing'],
  ['i feel like i am dying', 'feels_like_dying'],
  ['mujhe seene mein bahut dard ho raha hai', 'chest'],
  ['chhati me tez dard hai', 'chest'],
  ['मुझे सीने में दर्द है', 'chest'],
  ["I can't breathe properly", 'breathing'],
  ['saans nahi aa rahi', 'breathing'],
  ['मुझे सांस लेने में तकलीफ है', 'breathing'],
  ['my father has slurred speech and one side of his face droops', 'stroke'],
  ['unko lakwa maar gaya', 'stroke'],
  ['वो बोल नहीं पा रहे', 'stroke'],
  ['she fainted and is unresponsive', 'unconscious_seizure'],
  ['wo behosh ho gaya', 'unconscious_seizure'],
  ['मरीज बेहोश है', 'unconscious_seizure'],
  ['bleeding that will not stop', 'bleeding'],
  ['khoon nahi ruk raha', 'bleeding'],
  ['वो खून की उल्टी कर रहा है', 'bleeding'],
  ['he swallowed poison', 'poison_injury'],
  ['bachche ne zeher kha liya', 'poison_injury'],
  ['my throat is swelling after the tablet', 'allergic'],
  ['this is the worst headache of my life', 'severe_headache'],
  ['I want to die', 'self_harm'],
  ["I don't want to live anymore", 'self_harm'],
  ['mujhe marna chahta hu', 'self_harm'],
  ['मैं आत्महत्या करना चाहता हूँ', 'self_harm'],
  ["I'm pregnant and bleeding heavily", 'pregnancy_newborn'],
  ['the baby is not moving', 'pregnancy_newborn'],
  ['my newborn is not breathing', 'pregnancy_newborn'],
  ['garbhwati hu aur bahut khoon aa raha hai', 'pregnancy_newborn'],
];

for (const [message, category] of SHOULD_FLAG) {
  test(`flags "${message}" as ${category}`, () => {
    const r = detectEmergency(message);
    assert.ok(r, 'expected an emergency');
    assert.equal(r.category, category);
    assert.ok(r.message.length > 20);
  });
}

const SHOULD_NOT_FLAG = [
  'I have a mild headache since yesterday',
  'fever and cold for two days',
  'knee pain when climbing stairs',
  'no chest pain',
  'chest pain nahi hai',
  'I have never fainted',
  'not suicidal',
  'I had chest pain two years ago but it is fine now',
  'my mother had a stroke last year',
  'family history of heart attack',
  'meri pregnancy ka teesra mahina chal raha hai',
  'stomach ache after lunch',
  'mujhe khansi aur zukam hai',
  'No',
  '',
];

for (const message of SHOULD_NOT_FLAG) {
  test(`does not flag "${message}"`, () => {
    assert.equal(detectEmergency(message), null);
  });
}

test('only ever shows 112, 108 and 102, with the right ones per situation', () => {
  assert.deepEqual(numbersOf(detectEmergency('severe chest pain')), ['108', '112']);
  assert.deepEqual(numbersOf(detectEmergency('I want to die')), ['112']);
  assert.deepEqual(numbersOf(detectEmergency('my newborn is not breathing')), ['102', '108', '112']);
  for (const [message] of SHOULD_FLAG) {
    const r = detectEmergency(message);
    for (const n of r.numbers) assert.ok(['112', '108', '102'].includes(n.number));
    const digitsInMessage = r.message.match(/\b\d{2,}\b/g) || [];
    for (const d of digitsInMessage) assert.ok(['112', '108', '102'].includes(d), `unexpected number ${d}`);
  }
});

test('a self-harm message wins over another symptom in the same message', () => {
  assert.equal(detectEmergency('I have chest pain and I want to die').category, 'self_harm');
});

test('long hostile input is scanned quickly', () => {
  const started = Date.now();
  detectEmergency('chest '.repeat(200000));
  detectEmergency('a '.repeat(300000) + 'pregnant ' + 'x '.repeat(100000));
  assert.ok(Date.now() - started < 1000);
});
