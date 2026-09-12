// Single source of truth for which JSON keys carry PII and how the wire-crypto
// wrapper (api/client.js's apiRequest) should treat each one. This must name
// the exact same keys as backend/config/sensitiveFields.js — a field
// encrypted on one side won't be recognized for decryption on the other if
// the two lists drift. To add or remove a sensitive field, edit this file
// only; nothing in walk.js/crypto.js needs to change.

// Encrypted in place (envelope replaces the plain value), matched by key
// name at any nesting depth or array position.
export const FIELD_ALIAS_GROUPS = {
  name: ['name', 'fullName', 'patientName', 'patient_name', 'doctorName', 'doctor'],
  email: ['email', 'patient_email', 'requested_by_email', 'authorized_by_email', 'inviterEmail', 'targetEmail'],
  phone: ['phone', 'mobile', 'patient_phone'],
  dob: ['dob', 'patient_dob'],
  address: ['address', 'hospital_address'],
  gender: ['gender', 'patient_gender'],
  bloodGroup: ['blood_group', 'patient_blood_group'],
  licenseNumber: ['license_number', 'licenseNumber', 'regNumber'],
  council: ['council', 'medicalCouncil'],
  degree: ['degree', 'qualifications'],
  hospitalName: ['hospital_name', 'hospitalName', 'hospital', 'clinicName'],
  specialty: ['specialty', 'specialization'],
  picture: ['picture'],
  // Request-only in practice — no response ever echoes a bare `password`
  // key back (password_hash/passwordHash are stripped server-side).
  credentials: ['password', 'newPassword', 'currentPassword'],
};

// Whole value becomes one opaque ciphertext — never parsed for embedded
// substrings (closes the "[Email: x@y.com] tucked inside notes" convention
// found in family member / report notes). `query` is the free-text AI-search
// box — a doctor typing "John Smith's cholesterol trend" is a real, common
// name leak this closes. A non-string value is JSON.stringify'd before
// encrypting and JSON.parse'd back after decrypting (see the envelope's
// `wasSerialized` flag in pii/crypto.js).
//
// Deliberately does NOT include `message`: that key is also the generic
// { message: "..." } success/error string returned by nearly every backend
// endpoint (unrelated to a notification's message body, which is what
// motivated this list) — matching is by bare key name only, with no way to
// tell the two apart, so including it would encrypt almost every status
// string in the app for no PII benefit. See README's "Wire-format PII
// encryption" section for this and other documented gaps.
export const WHOLE_FIELD_KEYS = ['notes', 'metadata', 'query'];

// Deleted from responses server-side — never appears in the wire format at
// all, so there's nothing for the frontend to do with these; listed here
// only so both configs stay visibly in sync.
export const STRIP_RESPONSE_KEYS = ['password_hash', 'passwordHash'];

const normalize = (key) => String(key).toLowerCase().replace(/_/g, '');

function buildFieldLookup() {
  const map = new Map();
  for (const names of Object.values(FIELD_ALIAS_GROUPS)) {
    for (const name of names) map.set(normalize(name), { serialize: false });
  }
  for (const name of WHOLE_FIELD_KEYS) map.set(normalize(name), { serialize: true });
  return map;
}

const FIELD_LOOKUP = buildFieldLookup();

// Returns `{ serialize: boolean }` if `key` is a designated sensitive field,
// or null if it isn't (and should just be recursed into / left alone).
export function matchSensitiveField(key) {
  return FIELD_LOOKUP.get(normalize(key)) || null;
}
