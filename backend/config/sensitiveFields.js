// Single source of truth for which JSON keys carry PII and how the wire-crypto
// boundary (backend/middleware/wireCrypto.js) should treat each one. The
// frontend keeps an independent copy of this same data at
// frontend/src/api/pii/fields.js — the two lists must name the same keys, or
// a field encrypted on one side won't be recognized for decryption on the
// other. To add or remove a sensitive field, edit this file only; nothing in
// the walker/middleware logic needs to change.

// Encrypted in place (envelope replaces the plain value), matched by key
// name at any nesting depth or array position — e.g. this covers
// `family_members[].name`, `doctor_patient.patient_email`,
// `doctors.cert_extracted_data.doctorName`, etc. automatically.
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
  // key back (password_hash/passwordHash are stripped entirely, below).
  credentials: ['password', 'newPassword', 'currentPassword'],
};

// Whole value becomes one opaque ciphertext — never parsed for embedded
// substrings (closes the "[Email: x@y.com] tucked inside notes" convention
// found in family_members.notes and reports.notes). A non-string value
// (e.g. `metadata`, an object) is JSON.stringify'd before encrypting and
// JSON.parse'd back after decrypting — see the envelope's `wasSerialized`
// flag in backend/middleware/wireCrypto.js.
//
// Deliberately does NOT include `message`: that key is also the generic
// { message: "..." } success/error string returned by nearly every endpoint
// in this app (unrelated to notifications.message, which is what motivated
// this list) — matching is by bare key name only, with no way to tell the
// two apart, so including it would encrypt almost every status string in
// the app for no PII benefit. This does leave notifications.message/.title
// (which sometimes narrate a name, e.g. "Dr. X requested access") as a
// known, documented gap — see README's "Wire-format PII encryption" section.
export const WHOLE_FIELD_KEYS = ['notes', 'metadata', 'query'];

// Deleted from outgoing responses entirely — never sent, not even
// encrypted. There is no legitimate reason for a client to ever receive
// these, hashed or not.
export const STRIP_RESPONSE_KEYS = ['password_hash', 'passwordHash'];

// Deliberately NOT covered here (see README's "Wire-format PII encryption"
// section for the reasoning): AI-generated narrative text (`answer`,
// `summary`, `insights`, `structured`) — these are the primary displayed
// content of the search/summary features, so field-encrypting them wouldn't
// reduce their real exposure (decrypt-to-render puts the same text in the
// DOM either way), and there's no structural leak to close the way there is
// for `notes`/`message`.

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
const STRIP_SET = new Set(STRIP_RESPONSE_KEYS.map(normalize));

// Returns `{ serialize: boolean }` if `key` is a designated sensitive field,
// or null if it isn't (and should just be recursed into / left alone).
export function matchSensitiveField(key) {
  return FIELD_LOOKUP.get(normalize(key)) || null;
}

export function isStripField(key) {
  return STRIP_SET.has(normalize(key));
}
