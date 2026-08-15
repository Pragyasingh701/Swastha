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
