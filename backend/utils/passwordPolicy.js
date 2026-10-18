// Server-side password rules. Until now the server enforced none at register
// or reset, so the only limits were whatever each frontend form happened to
// check (6 characters on one, 8 on the others) and a scripted client could
// set any password at all. Mirrored in frontend/src/utils/formValidation.js —
// keep the two in step.
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes, so anything longer would silently be
// truncated and two different long passwords could be equivalent.
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_RULES_MESSAGE =
  'Password must be 8 to 72 characters and include at least one letter and one number.';

// A short list of the passwords everyone tries first. Not a substitute for a
// breach-list check, just a floor.
const COMMON_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'passw0rd1', 'qwerty123', 'qwerty1234',
  'abc12345', 'abcd1234', 'admin123', 'admin1234', 'welcome1', 'welcome123',
  'letmein123', 'iloveyou1', 'iloveyou123', '12345678a', 'a12345678', 'swastha123',
]);

// Returns null when the password is acceptable, otherwise the message to show.
export function passwordPolicyError(password) {
  if (typeof password !== 'string') return PASSWORD_RULES_MESSAGE;
  if (password.length < PASSWORD_MIN_LENGTH || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return PASSWORD_RULES_MESSAGE;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return PASSWORD_RULES_MESSAGE;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is too common. Please choose a less predictable one.';
  }
  return null;
}
