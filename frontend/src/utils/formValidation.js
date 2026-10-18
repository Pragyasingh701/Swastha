// Shared client-side validation for auth/registration forms.
// Mirrors the equivalent checks enforced server-side in backend/routes/auth.js
// so users get instant feedback instead of a round-trip rejection.

export function sanitizePhoneInput(value) {
  return (value || '').replace(/\D/g, '').slice(0, 10);
}

export function isValidIndianPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^[6-9]\d{9}$/.test(phone.trim());
}

export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

export function isValidFullName(name) {
  if (!name || typeof name !== 'string') return false;
  return /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(name.trim());
}

export function isValidRegistrationNumber(value) {
  if (!value || typeof value !== 'string') return false;
  return /^(?=.*\d)[A-Za-z0-9/\-\s]{4,30}$/.test(value.trim());
}

export function isValidWordsField(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[A-Za-z][A-Za-z .,&-]{1,59}$/.test(value.trim());
}

export function isValidFreeTextField(value, { minLength = 3, maxLength = 150 } = {}) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) return false;
  return /[A-Za-z]/.test(trimmed);
}

export function isValidPastDate(dateStr, { minAge = 0, maxAge = 120 } = {}) {
  if (!dateStr) return false;
  const dob = new Date(dateStr);
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dob > today) return false;

  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= minAge && age <= maxAge;
}

// Password rules — the same as the server's (backend/utils/passwordPolicy.js);
// keep the two in step. Returns an error message, or '' when the password is fine.
export const PASSWORD_RULES_MESSAGE = 'Password must be 8 to 72 characters and include at least one letter and one number.';

const COMMON_PASSWORDS = new Set([
  'password1', 'password12', 'password123', 'passw0rd1', 'qwerty123', 'qwerty1234',
  'abc12345', 'abcd1234', 'admin123', 'admin1234', 'welcome1', 'welcome123',
  'letmein123', 'iloveyou1', 'iloveyou123', '12345678a', 'a12345678', 'swastha123',
]);

export function getPasswordError(password) {
  if (typeof password !== 'string') return PASSWORD_RULES_MESSAGE;
  const byteLength = new TextEncoder().encode(password).length;
  if (password.length < 8 || byteLength > 72) return PASSWORD_RULES_MESSAGE;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_RULES_MESSAGE;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'That password is too common. Please choose a less predictable one.';
  return '';
}

/**
 * The checks every doctor profile goes through, at sign-up and again when it is edited in
 * Settings. Returns the message for the first problem, or '' when the profile is fine.
 */
export function getDoctorProfileError({ dob, regNumber, degree, specialization, hospitalName, address }) {
  if (!isValidPastDate(dob, { minAge: 21, maxAge: 100 })) {
    return 'Please enter a valid date of birth (doctors must be at least 21 years old).';
  }
  if (!isValidRegistrationNumber(regNumber)) {
    return 'Please enter a valid Medical Registration Number (must include at least one digit, e.g. MCI-12345).';
  }
  if (!isValidWordsField(degree)) {
    return 'Please enter a valid Primary Degree (e.g. MBBS, MD).';
  }
  if (!isValidWordsField(specialization)) {
    return 'Please enter a valid Specialization (e.g. Cardiology).';
  }
  if (!isValidFreeTextField(hospitalName, { minLength: 3, maxLength: 150 })) {
    return 'Please enter a valid Hospital or Clinic Name.';
  }
  if (!isValidFreeTextField(address, { minLength: 8, maxLength: 300 })) {
    return 'Please enter a valid, complete practice address.';
  }
  return '';
}
