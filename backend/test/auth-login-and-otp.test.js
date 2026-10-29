// Sign-in: password login, registration, the emailed one-time code, and resend.
// Runs the real routes against an in-memory database (see helpers/).
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { startTestApp } from './helpers/testApp.js';

const PASSWORD = 'Str0ng!Passw0rd#1';
const db = createFakeSupabase();
const app = await startTestApp(db);
after(() => app.close());

const patient = {
  id: 'usr_patient1',
  email: 'asha@example.test',
  name: 'Asha Rao',
  password_hash: await bcrypt.hash(PASSWORD, 4),
  patient_code: 'P-1001',
};
const googleOnly = { id: 'usr_g_1', email: 'gita@example.test', name: 'Gita Nair', password_hash: null };

beforeEach(() => {
  db.clear();
  db.insert('patients', patient);
  db.insert('patients', googleOnly);
  app.mail.otps.length = 0;
  app.mail.accountExists.length = 0;
  // OTP challenge state lives in process memory; start every test from nothing.
  global.__otpStoreRaw.clear();
  global.__otpMeta.clear();
});

const login = (email = patient.email, password = PASSWORD) =>
  app.api('POST', '/api/auth/login', { body: { email, password } });
const verify = (email, otpCode, extra = {}) =>
  app.api('POST', '/api/auth/verify-otp', { body: { email, otpCode, ...extra } });
const lastCode = () => app.mail.otps.at(-1)?.code;

// ── login ────────────────────────────────────────────────────────────────

test('a correct password sends a code and does not log you in yet', async () => {
  const { status, body } = await login();
  assert.equal(status, 200);
  assert.equal(body.requiresOTP, true);
  assert.equal(body.token, undefined);
  assert.equal(app.mail.otps.length, 1);
  assert.equal(app.mail.otps[0].to, patient.email);
  assert.match(lastCode(), /^\d{6}$/);
});

test('wrong password, unknown email and a Google-only account all get the same answer', async () => {
  const wrong = await login(patient.email, 'Not-the-password-1!');
  const unknown = await login('nobody@example.test', PASSWORD);
  const google = await login(googleOnly.email, PASSWORD);
  for (const reply of [wrong, unknown, google]) assert.equal(reply.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.deepEqual(google.body, wrong.body);
  assert.equal(app.mail.otps.length, 0, 'no code is sent for a failed password');
});

test('login needs both an email and a password', async () => {
  assert.equal((await app.api('POST', '/api/auth/login', { body: { email: patient.email } })).status, 400);
  assert.equal((await app.api('POST', '/api/auth/login', { body: { password: PASSWORD } })).status, 400);
  assert.equal((await app.api('POST', '/api/auth/login', { body: { email: { $ne: '' }, password: PASSWORD } })).status, 400);
});

test('the email is matched without regard to case or surrounding spaces', async () => {
  const { status } = await login('  ASHA@Example.TEST ');
  assert.equal(status, 200);
  assert.equal(app.mail.otps[0].to, patient.email);
});

// ── verify-otp ───────────────────────────────────────────────────────────

test('the right code logs you in with a session token for that account', async () => {
  await login();
  const { status, body } = await verify(patient.email, lastCode());
  assert.equal(status, 200);
  const claims = jwt.verify(body.token, process.env.JWT_SECRET);
  assert.equal(claims.userId, patient.id);
  assert.equal(claims.email, patient.email);
  assert.equal(claims.role, 'patient');
  assert.equal(body.user.password_hash, undefined, 'the password hash is never returned');
  assert.equal(body.user.passwordHash, undefined);
});

test('a code works only once', async () => {
  await login();
  const code = lastCode();
  assert.equal((await verify(patient.email, code)).status, 200);
  assert.equal((await verify(patient.email, code)).status, 400);
});

test('a wrong code is refused, and the right one still works afterwards', async () => {
  await login();
  const code = lastCode();
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await verify(patient.email, wrong)).status, 400);
  assert.equal((await verify(patient.email, code)).status, 200);
});

test('five wrong codes lock the sign-in: even the real code stops working', async () => {
  await login();
  const code = lastCode();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.equal((await verify(patient.email, wrong)).status, 400);
  assert.equal((await verify(patient.email, wrong)).status, 429);
  assert.equal((await verify(patient.email, code)).status, 400);
  // A fresh password sign-in starts a new challenge.
  await login();
  assert.equal((await verify(patient.email, lastCode())).status, 200);
});

test('a code cannot be used without having signed in first', async () => {
  assert.equal((await verify(patient.email, '123456')).status, 400);
});

test('an expired code is refused', async () => {
  await login();
  const code = lastCode();
  for (const list of global.__otpStoreRaw.values()) for (const entry of list) entry.expiresAt = Date.now() - 1000;
  assert.equal((await verify(patient.email, code)).status, 400);
});

test('a code for one account does not open another', async () => {
  await login();
  const code = lastCode();
  assert.equal((await verify(googleOnly.email, code)).status, 400);
});

test('malformed codes and emails are rejected before anything is checked', async () => {
  for (const bad of ['12345', '1234567', 'abcdef', 123456, null, undefined, ['123456']]) {
    assert.equal((await verify(patient.email, bad)).status, 400, `code ${JSON.stringify(bad)}`);
  }
  assert.equal((await verify('', '123456')).status, 400);
});

test('the internal "changepwd:" code space cannot be reached through the public endpoint', async () => {
  const token = jwt.sign({ userId: patient.id, email: patient.email, role: 'patient' }, process.env.JWT_SECRET);
  await app.api('POST', '/api/auth/change-password/send-otp', { token });
  const code = lastCode();
  const attempt = await verify(`changepwd:${patient.email}`, code);
  assert.equal(attempt.status, 400);
  assert.equal(attempt.body.token, undefined);
});

test('"Remember me" gives a longer session than a normal sign-in', async () => {
  await login();
  const normal = jwt.decode((await verify(patient.email, lastCode())).body.token);
  await login();
  const remembered = jwt.decode((await verify(patient.email, lastCode(), { rememberMe: true })).body.token);
  assert.equal(normal.exp - normal.iat, 24 * 3600);
  assert.equal(remembered.exp - remembered.iat, 7 * 24 * 3600);
  await login();
  const truthyString = jwt.decode((await verify(patient.email, lastCode(), { rememberMe: 'true' })).body.token);
  assert.equal(truthyString.exp - truthyString.iat, 24 * 3600, 'only a real true counts');
});

// ── resend ───────────────────────────────────────────────────────────────

test('resend without a sign-in in progress sends nothing and says nothing', async () => {
  const cold = await app.api('POST', '/api/auth/send-otp', { body: { email: patient.email } });
  const unknown = await app.api('POST', '/api/auth/send-otp', { body: { email: 'nobody@example.test' } });
  assert.equal(cold.status, 200);
  assert.deepEqual(unknown.body, cold.body);
  assert.equal(app.mail.otps.length, 0);
});

test('resend inside a sign-in waits for the cooldown, then sends a new code', async () => {
  await login();
  await app.api('POST', '/api/auth/send-otp', { body: { email: patient.email } });
  assert.equal(app.mail.otps.length, 1, 'too soon: nothing new is sent');

  global.__otpMeta.get(patient.email).lastIssuedAt = Date.now() - 31_000;
  await app.api('POST', '/api/auth/send-otp', { body: { email: patient.email } });
  assert.equal(app.mail.otps.length, 2);
});

test('resend stops after five resends', async () => {
  await login();
  for (let i = 0; i < 5; i++) {
    global.__otpMeta.get(patient.email).lastIssuedAt = Date.now() - 31_000;
    await app.api('POST', '/api/auth/send-otp', { body: { email: patient.email } });
  }
  assert.equal(app.mail.otps.length, 6);
  global.__otpMeta.get(patient.email).lastIssuedAt = Date.now() - 31_000;
  await app.api('POST', '/api/auth/send-otp', { body: { email: patient.email } });
  assert.equal(app.mail.otps.length, 6);
});

// ── register ─────────────────────────────────────────────────────────────

const registration = (overrides = {}) => ({
  fullName: 'Ravi Kumar',
  email: 'ravi@example.test',
  password: PASSWORD,
  phone: '9876543210',
  ...overrides,
});
const register = (overrides) => app.api('POST', '/api/auth/register', { body: registration(overrides) });

test('registering creates an account with no role, a hashed password, and sends a code', async () => {
  const { status, body } = await register();
  assert.equal(status, 201);
  assert.equal(body.requiresOTP, true);
  const [row] = db.rows('pending_registrations');
  assert.equal(row.email, 'ravi@example.test');
  assert.notEqual(row.password_hash, PASSWORD);
  assert.ok(await bcrypt.compare(PASSWORD, row.password_hash));
  assert.equal(app.mail.otps.length, 1);
  assert.equal(db.rows('doctors').length, 0);
});

test('the account type cannot be chosen at registration', async () => {
  await app.api('POST', '/api/auth/register', { body: { ...registration(), role: 'doctor', userType: 'doctor' } });
  assert.equal(db.rows('doctors').length, 0);
  assert.equal(db.rows('pending_registrations').length, 1);
});

test('registering an address that already has an account looks identical and sends no code', async () => {
  const fresh = await register();
  const existing = await register({ email: patient.email });
  assert.equal(existing.status, fresh.status);
  assert.deepEqual({ ...existing.body, email: null }, { ...fresh.body, email: null });
  assert.equal(app.mail.accountExists.length, 1);
  assert.equal(app.mail.accountExists[0].to, patient.email);
  assert.equal(app.mail.otps.length, 1, 'only the genuinely new address got a code');
  assert.equal(db.rows('patients').filter((p) => p.email === patient.email).length, 1);
});

test('registration rejects missing or invalid details', async () => {
  const cases = [
    [{ fullName: '' }, 400],
    [{ fullName: 'R2D2 <script>' }, 400],
    [{ email: 'not-an-email' }, 400],
    [{ phone: '12345' }, 400],
    [{ phone: '0123456789' }, 400],
    [{ password: 'short' }, 400],
    [{ password: 'abcdefghij' }, 400],
    [{ password: '1234567890' }, 400],
    [{ password: 'password123' }, 400],
  ];
  for (const [overrides, expected] of cases) {
    const { status } = await register(overrides);
    assert.equal(status, expected, JSON.stringify(overrides));
  }
  assert.equal(db.rows('pending_registrations').length, 0);
  assert.equal(app.mail.otps.length, 0);
});

test('a registered address can finish sign-up with the emailed code, and gets no role yet', async () => {
  await register();
  const { status, body } = await verify('ravi@example.test', lastCode());
  assert.equal(status, 200);
  assert.equal(body.user.hasSelectedRole, false);
  assert.equal(jwt.decode(body.token).role, 'none');
});
