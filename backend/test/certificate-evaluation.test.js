// What the certificate scan decides on its own: whether the number on the page is the number typed
// on the form, and whether the printed expiry has passed. The model only reads the page; these
// decisions are made in code, because the model's own yes/no answers are guesses (it does not
// know today's date, and it will happily "match" a fragment).
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  JWT_SECRET: 'test-jwt-secret-not-used-anywhere-else',
  ALLOW_OPENROUTER_FALLBACK: 'false',
  GEMINI_API_KEYS: 'test-key-1',
});
const { __testing } = await import('../services/certificateParserService.js');
const { evaluateParsedCertificate, readExpiry, registrationNumbersMatch } = __testing;

const TODAY = new Date('2026-06-15T10:00:00Z');
const certificate = (overrides = {}) => ({
  isMedicalCertificate: true,
  regNumber: 'NMC/25007',
  doctorName: 'Dr. Aarav Sharma',
  medicalCouncil: 'National Medical Commission',
  qualifications: ['MBBS'],
  expiryDate: null,
  isExpired: false,
  ...overrides,
});
const evaluate = (parsed, regNumber = 'NMC/25007') => evaluateParsedCertificate(parsed, { regNumber }, TODAY);

test('expiry comes from the printed date, not from the model\'s own "isExpired"', () => {
  assert.equal(evaluate(certificate({ expiryDate: '2026-01-01', isExpired: false })).validation.isExpired, true);
  assert.equal(evaluate(certificate({ expiryDate: '2030-01-01', isExpired: true })).validation.isExpired, false);
  assert.equal(evaluate(certificate({ expiryDate: null, isExpired: true })).validation.isExpired, false, 'no date shown: nothing to compare');
});

test('a certificate is valid through its expiry date itself', () => {
  assert.equal(readExpiry('2026-06-15', TODAY).isExpired, false);
  assert.equal(readExpiry('2026-06-14', TODAY).isExpired, true);
});

test('an unreadable or impossible date counts as no date, not as expired', () => {
  for (const bad of ['next year', '15/06/2030', '2026-13-40', '2026-02-30', '', null, undefined, 20260101]) {
    assert.deepEqual(readExpiry(bad, TODAY), { expiryDate: null, isExpired: false }, String(bad));
  }
});

test('an expired certificate is reported as expired and does not pass', () => {
  const result = evaluate(certificate({ expiryDate: '2025-12-31' }));
  assert.equal(result.success, false);
  assert.match(result.validationError, /expired/i);
  assert.equal(result.extractedData.isExpired, true);
});

test('a matching, unexpired medical certificate passes the scan', () => {
  const result = evaluate(certificate({ expiryDate: '2031-03-01' }));
  assert.equal(result.success, true);
  assert.equal(result.validationError, null);
});

test('registration numbers match on the digits, whatever the prefix and punctuation', () => {
  assert.equal(registrationNumbersMatch('NMC/25007', 'NMC/25007'), true);
  assert.equal(registrationNumbersMatch('25007', 'NMC/25007'), true);
  assert.equal(registrationNumbersMatch('MCI-25007', 'nmc 25007'), true);
  assert.equal(registrationNumbersMatch('98765', 'NMC/2024/98765'), true);
});

test('a fragment or a bare prefix no longer matches a number', () => {
  assert.equal(registrationNumbersMatch('NMC/25007', 'NMC'), false);
  assert.equal(registrationNumbersMatch('NMC/25007', 'MCI'), false);
  assert.equal(registrationNumbersMatch('NMC/25007', '250'), false);
  assert.equal(registrationNumbersMatch('NMC/25007', '17'), false);
  assert.equal(registrationNumbersMatch('NMC/25007', 'NMC/99999'), false);
});

test('an empty number on the form matches nothing', () => {
  assert.equal(registrationNumbersMatch('', 'NMC/25007'), false);
  const result = evaluateParsedCertificate(certificate(), { regNumber: '' }, TODAY);
  assert.equal(result.success, false);
  assert.equal(result.validation.regNumberMatchesForm, false);
});

test('a different number, or none on the page, does not pass', () => {
  assert.equal(evaluate(certificate({ regNumber: 'NMC/11111' })).success, false);
  assert.equal(evaluate(certificate({ regNumber: null })).validation.regNumberFound, false);
  assert.equal(evaluate(certificate({ regNumber: null })).success, false);
});

test('a document that is not a certificate does not pass, and only a real true counts', () => {
  assert.equal(evaluate(certificate({ isMedicalCertificate: false })).success, false);
  assert.equal(evaluate(certificate({ isMedicalCertificate: 'false' })).isMedicalCertificate, false, 'a string is not a yes');
  assert.equal(evaluate(certificate({ isMedicalCertificate: 'yes' })).isMedicalCertificate, false);
});

test('fields the scan could not read stay empty instead of being filled in', () => {
  const { extractedData } = evaluateParsedCertificate(
    { isMedicalCertificate: true, regNumber: 'NMC/25007' },
    { regNumber: 'NMC/25007', fullName: 'Typed Name', council: 'Typed Council', degree: 'MD' },
    TODAY
  );
  assert.equal(extractedData.doctorName, null);
  assert.equal(extractedData.medicalCouncil, null);
  assert.deepEqual(extractedData.qualifications, []);
  assert.equal(extractedData.expiryDate, null);
});
