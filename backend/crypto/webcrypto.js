// Low-level WebCrypto primitives for the wire-format PII boundary — no JSON
// shape awareness here, that's backend/crypto/piiWalker.js. Deliberately
// uses only Node's built-in `node:crypto` WebCrypto implementation (the same
// standard API the browser exposes as `window.crypto.subtle`) — zero new
// crypto dependency, matching the frontend's equivalent module
// (frontend/src/api/pii/crypto.js), which must derive byte-identical keys
// from the same handshake.
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

// Fixed context string for HKDF's `info` parameter — must be byte-identical
// on both sides (mirrored in frontend/src/api/pii/crypto.js) or the two ends
// derive different keys from the same ECDH shared secret. A fixed value is
// safe here because each handshake already uses a fresh ephemeral ECDH
// keypair (see routes/crypto.js) — that's what gives per-session uniqueness,
// not this string.
const HKDF_INFO = new TextEncoder().encode('swastha-wire-pii-v1');
const HKDF_SALT = new Uint8Array(32); // fixed/zero — see HKDF_INFO note above

export async function generateEcdhKeyPair() {
  return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function exportRawPublicKey(publicKey) {
  const raw = await subtle.exportKey('raw', publicKey);
  return Buffer.from(raw).toString('base64');
}

export async function importRawPublicKey(base64) {
  const raw = Buffer.from(base64, 'base64');
  return subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

// Derives a non-extractable AES-256-GCM session key from an ECDH key
// exchange. `privateKey` is this side's ephemeral private key; `peerPublicKey`
// is the other side's imported ephemeral public key.
export async function deriveSessionKey(privateKey, peerPublicKey) {
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: peerPublicKey }, privateKey, 256);
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypts one string value with a fresh random 96-bit IV. AES-GCM's output
// already includes the auth tag appended to the ciphertext, so `data` alone
// is a complete, tamper-evident value — no separate tag field needed.
export async function encryptString(key, plaintext) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { iv: Buffer.from(iv).toString('base64'), data: Buffer.from(data).toString('base64') };
}

export async function decryptString(key, { iv, data }) {
  const ivBytes = Buffer.from(iv, 'base64');
  const dataBytes = Buffer.from(data, 'base64');
  const plainBytes = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, dataBytes);
  return new TextDecoder().decode(plainBytes);
}
