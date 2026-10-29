// The server logs must not carry people's details (utils/safeLogging.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactText, scrubArgs, installSafeLogging } from '../utils/safeLogging.js';

const flat = (args) => scrubArgs(args).join(' ');

test('emails, Indian mobile numbers and login tokens are masked', () => {
  assert.equal(redactText('send to jane.doe+x@mail.example.com now'), 'send to [email] now');
  assert.equal(redactText('call 9876543210 now'), 'call [number] now');
  assert.equal(redactText('call +91 9876543210 now'), 'call [number] now');
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c3JfMSJ9.abcdefghijklmnop';
  assert.equal(redactText(`Authorization: Bearer ${jwt}`), 'Authorization: [token]');
});

test('ordinary log text is left alone', () => {
  assert.equal(redactText('[Brevo] delivered in 1234567890123 ms for report 7b1c-uuid'), '[Brevo] delivered in 1234567890123 ms for report 7b1c-uuid');
});

test('a database error loses its row details but keeps what is needed to debug', () => {
  const err = Object.assign(new Error('duplicate key value violates unique constraint "patients_email_key"'), {
    code: '23505',
    details: 'Key (email)=(sarah@example.com) already exists.',
    hint: 'patient Sarah Johnson, 9876543210',
  });
  const out = flat(['Create failed:', err]);
  assert.match(out, /duplicate key value violates unique constraint/);
  assert.match(out, /code=23505/);
  assert.ok(!/sarah|9876543210|Johnson/i.test(out), out);
});

test('a plain error-shaped object (as the database client returns) is reduced the same way', () => {
  const out = flat([{ message: 'insert failed', code: '23505', details: 'Key (email)=(a@b.com) exists', hint: null }]);
  assert.match(out, /insert failed/);
  assert.ok(!/a@b\.com|Key \(email\)/.test(out), out);
});

test('an email inside an error message is masked', () => {
  const out = flat([new Error('could not deliver to patient@clinic.in')]);
  assert.ok(!/patient@clinic\.in/.test(out) && /\[email\]/.test(out));
});

test('other values pass through, and installing twice does not double-wrap', () => {
  const obj = { a: 1 };
  assert.deepEqual(scrubArgs([obj, 5, null]), [obj, 5, null]);
  const seen = [];
  const fake = { log: (...a) => seen.push(a), info() {}, warn() {}, error() {} };
  installSafeLogging(fake);
  installSafeLogging(fake);
  fake.log('hi a@b.com');
  assert.deepEqual(seen, [['hi [email]']]);
});
