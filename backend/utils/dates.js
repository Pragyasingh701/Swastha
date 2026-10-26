// Is a date later than "today"? The server runs on UTC, but the person entering the date
// does not: in India, between 00:00 and 05:30 it is already tomorrow's date compared with UTC.
// Comparing against the server's own "today" therefore rejected the date they entered as
// "in the future". Instead a date is only in the future if it is later than today in the
// earliest time zone on Earth (UTC+14), which is the furthest ahead anyone's local date can be.
const EARLIEST_OFFSET_HOURS = 14;

function calendarDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** True when `value` (a YYYY-MM-DD string, an ISO timestamp or a Date) is a calendar day nobody could be on yet. */
export function isFutureDate(value, now = new Date()) {
  const day = calendarDay(value instanceof Date ? value.toISOString() : value);
  if (!day) return false;
  const latestDayAnywhere = new Date(now.getTime() + EARLIEST_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
  return day > latestDayAnywhere;
}
