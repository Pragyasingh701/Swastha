// Age from a date of birth. One copy, used wherever the server works out an age.

/** Whole years lived at `now`, or null when `dob` is empty or not a date. Not range-checked. */
export function wholeYears(dob, now = new Date()) {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;

  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Whole years lived, or null when the date is missing, unreadable, in the future or implausibly old (over 150). */
export function ageFromDob(dob, now = new Date()) {
  const age = wholeYears(dob, now);
  return age !== null && age >= 0 && age <= 150 ? age : null;
}
