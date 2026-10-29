// After sign-in: session tokens, forgotten and changed passwords, and the profile step
// that turns a new account into a patient or doctor. Runs the real routes against an
// in-memory database (see helpers/).
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { startTestApp } from './helpers/testApp.js';

const OLD_PASSWORD = 'Old!Passw0rd#1';
const NEW_PASSWORD = 'New!Passw0rd#2';
const db = createFakeSupabase();
const app = await startTestApp(db);
after(() => app.close());

const { signAuthToken, signPurposeToken } = await import('../config/jwt.js');
const hash = await bcrypt.hash(OLD_PASSWORD, 4);

const patient = { id: 'usr_patient1', email: 'asha@example.test', name: 'Asha Rao', password_hash: hash };
const otherPatient = { id: 'usr_patient2', email: 'meera@example.test', name: 'Meera Das', password_hash: hash };
const googleOnly = { id: 'usr_g_1', email: 'gita@example.test', name: 'Gita Nair', password_hash: null };
const newcomer = { id: 'usr_new1', email: 'ravi@example.test', name: 'Ravi Kumar', password_hash: hash };

const tokenFor = (user, role = 'patient', extra = {}) =>
  signAuthToken({ userId: user.id, email: user.email, role, ...extra });

beforeEach(() => {
  db.clear();
  db.insert('patients', patient);
  db.insert('patients', otherPatient);
  db.insert('patients', googleOnly);
  db.insert('pending_registrations', newcomer);
  for (const list of [app.mail.otps, app.mail.resets, app.mail.accountExists]) list.length = 0;
  global.__otpStoreRaw.clear();
  global.__otpMeta.clear();
  global.__resetTokenStore.clear();
  global.__passwordChangeTokenStore.clear();
});

const storedHash = (email) => db.rows('patients').find((p) => p.email === email)?.password_hash;
const loginWorks = async (email, password) => {
  const { status } = await app.api('POST', '/api/auth/login', { body: { email, password } });
  return status === 200;
};

// ── session tokens ───────────────────────────────────────────────────────

test('/me returns the logged-in account, never its password hash', async () => {
  const { status, body } = await app.api('GET', '/api/auth/me', { token: tokenFor(patient) });
  assert.equal(status, 200);
  assert.equal(body.user.email, patient.email);
  assert.equal(JSON.stringify(body).includes('password_hash'), false);
  assert.equal(JSON.stringify(body).includes(hash), false);
});

test('missing, malformed, forged and expired tokens are all refused', async () => {
  const forged = jwt.sign({ userId: patient.id, email: patient.email, role: 'patient' }, 'some-other-secret');
  const expired = jwt.sign({ userId: patient.id, email: patient.email, role: 'patient' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ userId: patient.id, email: patient.email })).toString('base64url')}.`;
  const purposeOnly = signPurposeToken('clinic-code', { userId: patient.id, email: patient.email }, '10m');

  assert.equal((await app.api('GET', '/api/auth/me')).status, 401);
  for (const token of ['garbage', forged, expired, unsigned, purposeOnly]) {
    assert.equal((await app.api('GET', '/api/auth/me', { token })).status, 401, String(token).slice(0, 30));
  }
  assert.equal((await app.api('GET', '/api/auth/me', { headers: { authorization: tokenFor(patient) } })).status, 401, 'needs the Bearer prefix');
});

test('a valid token for an account that no longer exists finds nothing', async () => {
  const ghost = tokenFor({ id: 'usr_gone', email: 'gone@example.test' });
  assert.equal((await app.api('GET', '/api/auth/me', { token: ghost })).status, 404);
});

test('routes that change an account need a session token', async () => {
  for (const [method, path] of [
    ['POST', '/api/auth/profile'],
    ['POST', '/api/auth/change-password/send-otp'],
    ['POST', '/api/auth/change-password/verify-otp'],
    ['POST', '/api/auth/change-password/confirm'],
    ['POST', '/api/auth/upload'],
    ['DELETE', '/api/auth/user'],
  ]) {
    assert.equal((await app.api(method, path, { body: {} })).status, 401, `${method} ${path}`);
  }
});

// ── forgot / reset password ──────────────────────────────────────────────

const forgot = (email) => app.api('POST', '/api/auth/forgot-password', { body: { email } });
const resetWith = (token, newPassword) =>
  app.api('POST', '/api/auth/reset-password', { body: { token, newPassword } });
const mailedResetToken = () => app.mail.resets.at(-1)?.token;

test('forgot-password answers the same for a known, unknown and Google-only address', async () => {
  const known = await forgot(patient.email);
  const unknown = await forgot('nobody@example.test');
  const google = await forgot(googleOnly.email);
  assert.equal(known.status, 200);
  assert.deepEqual(unknown.body, known.body);
  assert.deepEqual(google.body, known.body);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.mail.resets.length, 1, 'only the account with a password gets a link');
  assert.equal(app.mail.resets[0].to, patient.email);
});

test('a reset link sets the new password once, and the old one stops working', async () => {
  await forgot(patient.email);
  await new Promise((resolve) => setImmediate(resolve));
  const token = mailedResetToken();

  const check = await app.api('GET', `/api/auth/verify-reset-token?token=${token}`);
  assert.equal(check.status, 200);
  assert.equal(check.body.valid, true);

  assert.equal((await resetWith(token, NEW_PASSWORD)).status, 200);
  assert.equal(await loginWorks(patient.email, NEW_PASSWORD), true);
  assert.equal(await loginWorks(patient.email, OLD_PASSWORD), false);

  assert.equal((await resetWith(token, 'Another!Passw0rd3')).status, 400, 'the link works only once');
  assert.equal((await app.api('GET', `/api/auth/verify-reset-token?token=${token}`)).status, 400);
});

test('reset refuses a weak password, the current password, and unknown or expired links', async () => {
  await forgot(patient.email);
  await new Promise((resolve) => setImmediate(resolve));
  const token = mailedResetToken();

  assert.equal((await resetWith(token, 'short1')).status, 400);
  assert.equal((await resetWith(token, OLD_PASSWORD)).status, 400, 'the same password is not a reset');
  assert.equal((await resetWith('rst_not-a-real-token', NEW_PASSWORD)).status, 400);
  assert.equal((await resetWith(undefined, NEW_PASSWORD)).status, 400);
  assert.equal(storedHash(patient.email), hash, 'nothing was changed by the refused attempts');

  global.__resetTokenStore.get(token).expiresAt = Date.now() - 1000;
  assert.equal((await resetWith(token, NEW_PASSWORD)).status, 400);
  assert.equal(storedHash(patient.email), hash);
});

test('a reset link resets the account it was sent to, whatever email the request names', async () => {
  await forgot(patient.email);
  await new Promise((resolve) => setImmediate(resolve));
  const token = mailedResetToken();
  const attempt = await app.api('POST', '/api/auth/reset-password', {
    body: { token, email: otherPatient.email, newPassword: NEW_PASSWORD },
  });
  assert.equal(attempt.status, 200);
  assert.equal(await loginWorks(patient.email, NEW_PASSWORD), true);
  assert.equal(storedHash(otherPatient.email), hash, 'the other account is untouched');
});

test('asking for a second reset link cancels the first', async () => {
  await forgot(patient.email);
  await new Promise((resolve) => setImmediate(resolve));
  const first = mailedResetToken();
  await forgot(patient.email);
  await new Promise((resolve) => setImmediate(resolve));
  const second = mailedResetToken();
  assert.notEqual(first, second);
  assert.equal((await resetWith(first, NEW_PASSWORD)).status, 400);
  assert.equal((await resetWith(second, NEW_PASSWORD)).status, 200);
});

test('a failed database write leaves the reset link usable for another try', async () => {
  await forgot(patient.email);
  await new Promise((resolve) => setImmediate(resolve));
  const token = mailedResetToken();
  db.failNext('patients', 'update');
  assert.equal((await resetWith(token, NEW_PASSWORD)).status, 500);
  assert.equal(storedHash(patient.email), hash);
  assert.equal((await resetWith(token, NEW_PASSWORD)).status, 200);
});

// ── change password (signed in) ──────────────────────────────────────────

const sendChangeCode = (user = patient) => app.api('POST', '/api/auth/change-password/send-otp', { token: tokenFor(user) });
const verifyChangeCode = (code, user = patient) =>
  app.api('POST', '/api/auth/change-password/verify-otp', { token: tokenFor(user), body: { otpCode: code } });
const confirmChange = (changeToken, newPassword = NEW_PASSWORD, user = patient) =>
  app.api('POST', '/api/auth/change-password/confirm', { token: tokenFor(user), body: { changeToken, newPassword } });

test('changing your password takes a code from your email, then a one-time change token', async () => {
  assert.equal((await sendChangeCode()).status, 200);
  assert.equal(app.mail.otps.at(-1).to, patient.email);
  const verified = await verifyChangeCode(app.mail.otps.at(-1).code);
  assert.equal(verified.status, 200);
  assert.match(verified.body.changeToken, /^chg_/);

  assert.equal((await confirmChange(verified.body.changeToken)).status, 200);
  assert.equal(await loginWorks(patient.email, NEW_PASSWORD), true);
  assert.equal(await loginWorks(patient.email, OLD_PASSWORD), false);
  assert.equal((await confirmChange(verified.body.changeToken, 'Third!Passw0rd4')).status, 400, 'single use');
});

test('the password cannot be changed without verifying the code first', async () => {
  await sendChangeCode();
  assert.equal((await confirmChange(undefined)).status, 400);
  assert.equal((await confirmChange('chg_made-up')).status, 400);
  assert.equal(storedHash(patient.email), hash);
});

test('a wrong change code is refused, and five of them lock it', async () => {
  await sendChangeCode();
  const code = app.mail.otps.at(-1).code;
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.equal((await verifyChangeCode(wrong)).status, 400);
  assert.equal((await verifyChangeCode(wrong)).status, 429);
  assert.equal((await verifyChangeCode(code)).status, 400);
});

test('a login code cannot stand in for a change-password code', async () => {
  await app.api('POST', '/api/auth/login', { body: { email: patient.email, password: OLD_PASSWORD } });
  const loginCode = app.mail.otps.at(-1).code;
  assert.equal((await verifyChangeCode(loginCode)).status, 400);
});

test("one account's change token does not work for another account", async () => {
  await sendChangeCode(patient);
  const verified = await verifyChangeCode(app.mail.otps.at(-1).code, patient);
  const stolen = await confirmChange(verified.body.changeToken, NEW_PASSWORD, otherPatient);
  assert.equal(stolen.status, 400);
  assert.equal(storedHash(otherPatient.email), hash);
});

test('change-password refuses a weak password and the current one', async () => {
  await sendChangeCode();
  const { body } = await verifyChangeCode(app.mail.otps.at(-1).code);
  assert.equal((await confirmChange(body.changeToken, 'weak')).status, 400);
  assert.equal((await confirmChange(body.changeToken, OLD_PASSWORD)).status, 400);
  assert.equal((await confirmChange(body.changeToken, NEW_PASSWORD)).status, 200, 'the token survived the refused attempts');
});

test('a Google-only account has no password to change', async () => {
  const { status } = await sendChangeCode(googleOnly);
  assert.equal(status, 400);
  assert.equal(app.mail.otps.length, 0);
});

// ── profile: becoming a patient or a doctor ──────────────────────────────

const profile = (user, body, role = 'none') => app.api('POST', '/api/auth/profile', { token: tokenFor(user, role), body });
const patientDetails = {
  role: 'patient',
  fullName: 'Ravi Kumar',
  dob: '1990-05-14',
  gender: 'M',
  bloodGroup: 'O+',
  phone: '9876543210',
};

test('a new account becomes a patient, with a fresh token that carries the role', async () => {
  const { status, body } = await profile(newcomer, patientDetails);
  assert.equal(status, 200);
  assert.equal(body.user.role, 'patient');
  assert.equal(jwt.decode(body.token).role, 'patient');
  assert.equal(db.rows('pending_registrations').length, 0, 'the pending row was moved');
  const saved = db.rows('patients').find((p) => p.email === newcomer.email);
  assert.ok(saved, 'a patients row exists');
  assert.match(String(saved.patient_code), /\S/, 'the patient got a patient code');
  assert.equal(JSON.stringify(body).includes('password_hash'), false);
});

test('first-time setup needs every patient detail', async () => {
  for (const missing of ['fullName', 'dob', 'gender', 'bloodGroup', 'phone']) {
    const details = { ...patientDetails };
    delete details[missing];
    assert.equal((await profile(newcomer, details)).status, 400, `without ${missing}`);
  }
  assert.equal((await profile(newcomer, { ...patientDetails, dob: '2999-01-01' })).status, 400);
  assert.equal((await profile(newcomer, { ...patientDetails, phone: '123' })).status, 400);
  assert.equal(db.rows('pending_registrations').length, 1, 'nothing was created by the refused attempts');
});

test('the role must be patient or doctor, and cannot be left out on first setup', async () => {
  assert.equal((await profile(newcomer, { ...patientDetails, role: 'admin' })).status, 400);
  const { role, ...withoutRole } = patientDetails;
  assert.equal((await profile(newcomer, withoutRole)).status, 400);
});

test('a patient cannot turn their account into a doctor account', async () => {
  const { status, body } = await profile(patient, { role: 'doctor', fullName: 'Asha Rao' }, 'patient');
  assert.equal(status, 400);
  assert.match(body.message, /cannot be changed/i);
  assert.equal(db.rows('doctors').length, 0);
});

test('the profile form cannot change who the account is or what the server decided', async () => {
  const before = db.rows('patients').find((p) => p.id === patient.id);
  const { status } = await profile(patient, {
    role: 'patient',
    fullName: 'Asha Rao',
    email: 'attacker@example.test',
    id: otherPatient.id,
    userId: otherPatient.id,
    patient_code: 'P-HIJACK',
    password_hash: 'not-a-real-hash',
    verification_status: 'verified',
  }, 'patient');
  assert.equal(status, 200);
  const after = db.rows('patients');
  const mine = after.find((p) => p.id === patient.id);
  assert.equal(mine.email, patient.email);
  assert.equal(mine.password_hash, before.password_hash);
  assert.notEqual(mine.patient_code, 'P-HIJACK');
  assert.deepEqual(after.find((p) => p.id === otherPatient.id), db.rows('patients').find((p) => p.id === otherPatient.id));
  assert.equal(after.find((p) => p.id === otherPatient.id).name, otherPatient.name, 'the other account is untouched');
  assert.equal(after.some((p) => p.email === 'attacker@example.test'), false);
});

test('a doctor setup cannot point at someone else\'s file as its certificate', async () => {
  const doctorDetails = {
    role: 'doctor',
    fullName: 'Dr Anil Mehta',
    dob: '1980-02-02',
    phone: '9876543211',
    regNumber: 'MCI12345',
    council: 'Delhi Medical Council',
    degree: 'MBBS',
    specialization: 'Cardiology',
    hospitalName: 'City Hospital',
    address: '12 MG Road, Delhi',
  };
  const elsewhere = { ...doctorDetails, regCertificateUrl: 'https://evil.example/certificate.pdf' };
  const theirs = {
    ...doctorDetails,
    regCertificateUrl: 'https://test-project.supabase.co/storage/v1/object/sign/reports/certificates/usr_someone_else/abc.pdf?token=x',
  };
  assert.equal((await profile(newcomer, elsewhere)).status, 400);
  assert.equal((await profile(newcomer, theirs)).status, 400);
  assert.equal(db.rows('doctors').length, 0);
});

test('a doctor setup is held until the AI notice has been acknowledged', async () => {
  const ownCertificate = `https://test-project.supabase.co/storage/v1/object/sign/reports/certificates/${newcomer.id}/abc.pdf?token=x`;
  const { status, body } = await profile(newcomer, {
    role: 'doctor',
    fullName: 'Dr Anil Mehta',
    dob: '1980-02-02',
    phone: '9876543211',
    regNumber: 'MCI12345',
    council: 'Delhi Medical Council',
    degree: 'MBBS',
    specialization: 'Cardiology',
    hospitalName: 'City Hospital',
    address: '12 MG Road, Delhi',
    regCertificateUrl: ownCertificate,
  });
  assert.equal(status, 403);
  assert.equal(body.code, 'AI_NOTICE_ACK_REQUIRED');
  assert.equal(db.rows('doctors').length, 0);
  assert.equal(db.rows('pending_registrations').length, 1);
});
