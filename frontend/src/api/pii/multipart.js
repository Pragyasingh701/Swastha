// For multipart/form-data requests (cert upload, report save with a file),
// where the non-file sensitive fields can't ride inside the binary form
// body the way a JSON request carries them.
import { encryptPiiFields } from './walk.js';

/**
 * Runs `plainFields` through the same per-field PII walker used for JSON
 * bodies (encryptPiiFields) — non-sensitive fields stay plain, sensitive
 * ones become ciphertext envelopes — then attaches the whole (mixed)
 * result as one opaque form field, `encryptedFields`, alongside the
 * untouched binary file part. The backend's multipart handler
 * (backend/middleware/wireCrypto.js's decryptMultipartFields) unpacks this
 * one field with the same walker and merges its keys into req.body, so the
 * route handler reads it exactly as if the request had arrived as JSON.
 */
export async function attachEncryptedFields(formData, plainFields, baseUrl) {
  const walked = await encryptPiiFields(plainFields, baseUrl);
  formData.append('encryptedFields', JSON.stringify(walked));
  return formData;
}
