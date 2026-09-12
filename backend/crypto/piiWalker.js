// Recursive JSON walker shared by both directions of the wire-crypto
// boundary (backend/middleware/wireCrypto.js) — matches keys against
// config/sensitiveFields.js at any nesting depth or array position, so
// arrays of family members, the doctor_patient denormalized snapshot, and
// nested jsonb blobs like doctors.cert_extracted_data are all covered
// automatically without being named individually anywhere.
import { matchSensitiveField, isStripField } from '../config/sensitiveFields.js';

// Purely defensive — JSON from JSON.parse can't cycle, this just bounds
// pathological input.
const MAX_DEPTH = 12;

async function walk(value, transform, depth) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => walk(item, transform, depth + 1)));
  }

  const out = {};
  const jobs = [];
  for (const [key, val] of Object.entries(value)) {
    if (isStripField(key)) continue; // dropped entirely, both directions

    const match = matchSensitiveField(key);
    if (match) {
      // Matched keys are treated as one opaque unit and NOT recursed into
      // further, even when the value is itself an object (e.g. `metadata`)
      // — that's what lets whole-field encryption work uniformly for
      // string and non-string values alike.
      jobs.push(
        Promise.resolve(transform(val, match)).then((res) => {
          out[key] = res;
        })
      );
    } else if (val !== null && typeof val === 'object') {
      jobs.push(
        walk(val, transform, depth + 1).then((res) => {
          out[key] = res;
        })
      );
    } else {
      out[key] = val;
    }
  }
  await Promise.all(jobs);
  return out;
}

// `transform(value, { serialize }) -> newValue | Promise<newValue>` is
// applied to every leaf whose key matches config/sensitiveFields.js.
export function walkTree(value, transform) {
  return walk(value, transform, 0);
}
