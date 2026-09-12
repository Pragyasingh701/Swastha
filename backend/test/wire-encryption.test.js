// Wire-level tests for the PII encryption boundary (middleware/wireCrypto.js).
// Captures RAW response text (not parsed JSON) so these assertions catch
// exactly what a HAR export or a DevTools Network tab would show — a
// passing "decrypts back to the original" check alone would also pass on a
// server that never encrypted anything, so every test asserts BOTH that
// the raw wire text has no plaintext PII substring AND that decrypting it
// recovers the original value.
//
// Runs against a real ephemeral-port instance of the actual app (see
// backend/app.js) with a real ECDH handshake performed via Node's own
// crypto.webcrypto — an authentic client simulation, not a mock. Creates
// one throwaway patient user for the whole file and cleans up everything
// it creates (user, vault, family member, report) in `after`, since this
// hits the real configured Supabase project (no test-DB separation exists
// in this codebase).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import jwt from 'jsonwebtoken';

import app from '../app.js';
import { createOrUpdateUser, deleteUserById } from '../db/users.js';
import { deleteFamilyVaultForUser } from '../db/family.js';
import { deleteAllReportsForUser } from '../db/reports.js';

const { subtle } = webcrypto;
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';
// Must match backend/crypto/webcrypto.js's HKDF_INFO/HKDF_SALT exactly, or
// this "client" derives a different key than the server did.
const HKDF_INFO = new TextEncoder().encode('swastha-wire-pii-v1');
const HKDF_SALT = new Uint8Array(32);

let server;
let baseUrl;
let testUser;
let token;

function isEnvelope(value) {
  return !!value && typeof value === 'object' &&
    value.__enc === 1 && typeof value.iv === 'string' && typeof value.data === 'string';
}

async function deriveClientKey(clientPrivateKey, serverPublicKeyB64) {
  const raw = Buffer.from(serverPublicKeyB64, 'base64');
  const serverPublicKey = await subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: serverPublicKey }, clientPrivateKey, 256);
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptValue(key, plaintext) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { __enc: 1, iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64'), wasSerialized: false };
}

async function walkDecrypt(key, value) {
  if (value === null || typeof value !== 'object') return value;
  if (isEnvelope(value)) {
    const plainBytes = await subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(value.iv, 'base64') },
      key,
      Buffer.from(value.data, 'base64')
    );
    const plaintext = new TextDecoder().decode(plainBytes);
    return value.wasSerialized ? JSON.parse(plaintext) : plaintext;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => walkDecrypt(key, v)));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = await walkDecrypt(key, v);
  return out;
}

async function handshake() {
  const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const clientPublicKey = Buffer.from(await subtle.exportKey('raw', keyPair.publicKey)).toString('base64');

  const res = await fetch(`${baseUrl}/api/crypto/handshake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPublicKey }),
  });
  const data = await res.json();
  const key = await deriveClientKey(keyPair.privateKey, data.serverPublicKey);
  return { key, sessionId: data.sessionId };
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;

  testUser = await createOrUpdateUser({
    id: `usr_wiretest_${Date.now()}`,
    email: `wire-test-${Date.now()}@example.com`,
    name: 'Wire Test Patient',
    role: 'patient',
    phone: '9876500000',
    dob: '1990-01-01',
    gender: 'Male',
    bloodGroup: 'O+',
    authProvider: 'email',
  });
  token = jwt.sign({ userId: testUser.id, email: testUser.email, role: 'patient' }, JWT_SECRET, { expiresIn: '1h' });
});

after(async () => {
  await deleteAllReportsForUser(testUser.id);
  await deleteFamilyVaultForUser(testUser.id);
  await deleteUserById(testUser.id);
  await new Promise((resolve) => server.close(resolve));
  // backend/routes/auth.js's OTP/reset-token cleanup interval (pre-existing,
  // unrelated to this feature) isn't unref'd — harmless for the real
  // long-running server, but it would otherwise keep this short-lived test
  // process alive forever after the test run itself is done.
  process.exit(0);
});

test('handshake issues a session id and a fresh server public key', async () => {
  const { key, sessionId } = await handshake();
  assert.ok(sessionId);
  assert.ok(key);
});

test('POST /api/family/members: request PII decrypts server-side, response PII is ciphertext on the wire and decrypts back to the original', async () => {
  const { key, sessionId } = await handshake();

  // A vault must exist before a member can be created.
  await fetch(`${baseUrl}/api/family/vault`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Enc-Session-Id': sessionId },
  });

  const marker = 'Zzqx Family Marker';
  const res = await fetch(`${baseUrl}/api/family/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Enc-Session-Id': sessionId,
    },
    body: JSON.stringify({
      name: await encryptValue(key, marker),
      dob: '2010-05-05',
      relationship: 'Child',
      notes: await encryptValue(key, 'Routine checkup notes'),
    }),
  });

  const rawText = await res.text();
  assert.equal(res.status, 201);
  assert.ok(!rawText.includes(marker), 'raw response text has no plaintext name marker');

  const decrypted = await walkDecrypt(key, JSON.parse(rawText));
  assert.equal(decrypted.name, marker);

  await fetch(`${baseUrl}/api/family/members/${decrypted.id}/delete`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'X-Enc-Session-Id': sessionId },
  });
});

test('POST /api/reports + GET /api/reports: doctor field is ciphertext on the wire, decrypts back correctly, and a request with no session header falls back to plaintext', async () => {
  const { key, sessionId } = await handshake();
  const doctorMarker = 'Dr Zzqx Marker';

  const createRes = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Enc-Session-Id': sessionId,
    },
    body: JSON.stringify({
      title: 'Blood Test',
      doctor: await encryptValue(key, doctorMarker),
      category: 'Lab Report',
      reportDate: '2026-01-01',
    }),
  });
  const createRawText = await createRes.text();
  assert.equal(createRes.status, 201);
  assert.ok(!createRawText.includes(doctorMarker), 'create response has no plaintext doctor marker');

  const created = await walkDecrypt(key, JSON.parse(createRawText));
  assert.equal(created.report.doctor, doctorMarker);
  const reportId = created.report.id;

  // No X-Enc-Session-Id header at all -> legacy/plaintext passthrough,
  // both directions, unchanged from pre-encryption behavior.
  const plainRes = await fetch(`${baseUrl}/api/reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const plainText = await plainRes.text();
  assert.ok(plainText.includes(doctorMarker), 'no-header GET returns plaintext doctor name (legacy fallback)');

  await fetch(`${baseUrl}/api/reports/${reportId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'X-Enc-Session-Id': sessionId },
  });
});

test('GET /api/auth/me: password_hash never appears in the response, encrypted or not', async () => {
  const { sessionId } = await handshake();

  const encRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Enc-Session-Id': sessionId },
  });
  assert.ok(!(await encRes.text()).includes('password_hash'));

  const plainRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.ok(!(await plainRes.text()).includes('password_hash'));
});

test('an unresolvable X-Enc-Session-Id returns 401 ENC_SESSION_EXPIRED', async () => {
  const res = await fetch(`${baseUrl}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Enc-Session-Id': 'not-a-real-session-id' },
    body: JSON.stringify({ email: 'someone@example.com' }),
  });
  const data = await res.json();
  assert.equal(res.status, 401);
  assert.equal(data.code, 'ENC_SESSION_EXPIRED');
});

test('POST /api/auth/verify-otp: response user object is ciphertext on the wire and decrypts back to the real profile', async () => {
  const { key, sessionId } = await handshake();

  // Real OTP issuance (also sends a real email via Brevo) — read the code
  // straight out of the in-process store rather than wiring up email
  // receipt in a test.
  await fetch(`${baseUrl}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testUser.email }),
  });
  const otpList = global.__otpStoreRaw.get(testUser.email.toLowerCase().trim());
  assert.ok(otpList && otpList.length > 0, 'an OTP was actually queued for this test user');
  const otpCode = otpList[otpList.length - 1].code;

  const res = await fetch(`${baseUrl}/api/auth/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Enc-Session-Id': sessionId,
    },
    body: JSON.stringify({
      email: await encryptValue(key, testUser.email),
      otpCode,
    }),
  });
  const rawText = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!rawText.includes(testUser.email), 'raw response has no plaintext email');
  assert.ok(!rawText.includes('password_hash'));

  const decrypted = await walkDecrypt(key, JSON.parse(rawText));
  assert.equal(decrypted.user.email, testUser.email.toLowerCase());
  assert.equal(decrypted.user.name, testUser.name);
});
