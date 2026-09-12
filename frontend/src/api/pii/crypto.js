// Low-level WebCrypto primitives for the wire-format PII boundary — no JSON
// shape awareness here, that's walk.js. Uses only the browser's native
// window.crypto.subtle — zero new dependency, and the same standard API
// Node exposes as crypto.webcrypto on the backend (backend/crypto/webcrypto.js),
// which must derive a byte-identical key from the same handshake.
const subtle = window.crypto.subtle;

// Fixed context string for HKDF's `info` parameter — must be byte-identical
// to backend/crypto/webcrypto.js's HKDF_INFO, or the two ends derive
// different keys from the same ECDH shared secret. Safe as a fixed value
// because each handshake already uses a fresh ephemeral ECDH keypair — that
// or (not this string) is what gives per-session uniqueness.
const HKDF_INFO = new TextEncoder().encode('swastha-wire-pii-v1');
const HKDF_SALT = new Uint8Array(32); // fixed/zero — see HKDF_INFO note above

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function generateEcdhKeyPair() {
  return subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function exportRawPublicKey(publicKey) {
  const raw = await subtle.exportKey('raw', publicKey);
  return bufferToBase64(raw);
}

export async function importRawPublicKey(base64) {
  const raw = base64ToBuffer(base64);
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
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { iv: bufferToBase64(iv), data: bufferToBase64(data) };
}

export async function decryptString(key, { iv, data }) {
  const ivBytes = base64ToBuffer(iv);
  const dataBytes = base64ToBuffer(data);
  const plainBytes = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, dataBytes);
  return new TextDecoder().decode(plainBytes);
}
