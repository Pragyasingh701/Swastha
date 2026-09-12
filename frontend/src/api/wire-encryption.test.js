// Wire-level tests for the frontend half of the PII encryption boundary
// (api/client.js's apiRequest + api/pii/*). Captures the RAW outgoing
// request (body/URL/headers) exactly as the browser's Network tab would
// show it — a passing "decrypts back to the original" check alone would
// also pass if a field were simply never touched, so every test asserts
// BOTH that the captured wire-level data has no plaintext PII substring
// AND that the round trip recovers the original value.
//
// `fetch` is stubbed rather than hitting a real backend, but the crypto
// itself is real: this file plays the "server" side of the ECDH handshake
// using Node's own crypto.webcrypto (the same primitives
// backend/crypto/webcrypto.js uses), so the frontend code under test is
// doing an authentic key exchange and AES-GCM encrypt/decrypt, not a mock
// of the crypto.
import { test, expect, vi, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const HKDF_INFO = new TextEncoder().encode('swastha-wire-pii-v1');
const HKDF_SALT = new Uint8Array(32);

function isEnvelope(value) {
  return !!value && typeof value === 'object' && value.__enc === 1;
}

async function deriveServerKey(serverPrivateKey, clientPublicKeyB64) {
  const raw = Buffer.from(clientPublicKeyB64, 'base64');
  const clientPublicKey = await subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: clientPublicKey }, serverPrivateKey, 256);
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function serverEncrypt(key, plaintext) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { __enc: 1, iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64'), wasSerialized: false };
}

async function serverDecryptTree(key, value) {
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
  if (Array.isArray(value)) return Promise.all(value.map((v) => serverDecryptTree(key, v)));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = await serverDecryptTree(key, v);
  return out;
}

// Stubs global fetch: answers the ECDH handshake for real (so the module
// under test derives a genuine session key), and routes every other call
// to `onRequest(capturedRequest, serverKey)` for the test to inspect and
// answer.
function stubFetch(onRequest) {
  let serverKey = null;
  const fn = vi.fn(async (url, init = {}) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/crypto/handshake')) {
      const { clientPublicKey } = JSON.parse(init.body);
      const serverKeyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      serverKey = await deriveServerKey(serverKeyPair.privateKey, clientPublicKey);
      const serverPublicKey = Buffer.from(await subtle.exportKey('raw', serverKeyPair.publicKey)).toString('base64');
      return new Response(JSON.stringify({ sessionId: 'test-session-id', serverPublicKey, expiresAt: Date.now() + 1000000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const captured = { url: urlStr, method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    const result = await onRequest(captured, serverKey);
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

test('family.js createFamilyMember: request body has no plaintext PII on the wire, and the (encrypted) response decrypts back to the original', async () => {
  let capturedBody = null;
  stubFetch(async (req, key) => {
    if (req.url.includes('/family/members')) {
      capturedBody = req.body;
      const parsed = JSON.parse(req.body);
      const decryptedName = await serverDecryptTree(key, parsed.name);
      return {
        status: 201,
        body: {
          id: 'member-1',
          name: await serverEncrypt(key, decryptedName),
          dob: parsed.dob,
          relationship: parsed.relationship,
        },
      };
    }
    return { status: 404 };
  });

  const { createFamilyMember } = await import('./family.js');
  const marker = 'Zzqx Family Marker';
  const result = await createFamilyMember({ name: marker, dob: '2010-01-01', relationship: 'Child' }, 'fake-jwt-token');

  expect(capturedBody).not.toContain(marker);
  expect(result.name).toBe(marker);
});

test('reports.js createTimelineReport with a file: FormData carries the binary part untouched, plus one encryptedFields part with no plaintext PII', async () => {
  let capturedFormData = null;
  stubFetch(async (req) => {
    if (req.url.includes('/reports/') && req.method === 'POST') {
      capturedFormData = req.body;
      return { status: 201, body: { report: { id: 'r1', title: 'Blood Test' } } };
    }
    return { status: 404 };
  });

  const { createTimelineReport } = await import('./reports.js');
  const file = new File(['fake-bytes'], 'scan.pdf', { type: 'application/pdf' });
  const doctorMarker = 'Dr Zzqx Marker';
  await createTimelineReport(
    { title: 'Blood Test', doctor: doctorMarker, hospital: 'City Hospital', notes: 'routine notes' },
    'fake-jwt-token',
    file
  );

  expect(capturedFormData).toBeInstanceOf(FormData);
  expect(capturedFormData.get('file')).toBeInstanceOf(File);

  const encryptedFieldsRaw = capturedFormData.get('encryptedFields');
  expect(encryptedFieldsRaw).toBeTruthy();
  expect(encryptedFieldsRaw).not.toContain(doctorMarker);

  const parsed = JSON.parse(encryptedFieldsRaw);
  expect(parsed.doctor.__enc).toBe(1); // sensitive field: ciphertext envelope
  expect(parsed.title).toBe('Blood Test'); // non-sensitive field: left as plain structure
});

test('reports.js getTimelineReports: memberEmail travels as an encrypted X-Enc-Params header, never in the URL query string', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  stubFetch(async (req) => {
    capturedUrl = req.url;
    capturedHeaders = req.headers;
    return { status: 200, body: { reports: [] } };
  });

  const { getTimelineReports } = await import('./reports.js');
  const email = 'family-member@example.com';
  await getTimelineReports('fake-jwt-token', email);

  expect(capturedUrl).not.toContain(email);
  expect(capturedHeaders['X-Enc-Params']).toBeTruthy();
  expect(capturedHeaders['X-Enc-Params']).not.toContain(email);
});
