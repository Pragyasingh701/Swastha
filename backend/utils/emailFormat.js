// Email checks that cannot be made to run slowly.
//
// The patterns these replace had a quadratic worst case: a request with a long run of dots or
// spaces (the 2 MB body limit allows ~2 million characters) kept one CPU busy for seconds to
// minutes, freezing the whole single-threaded server for everyone. Everything here is a single
// pass over the text, and the length is checked before anything else.

export const MAX_EMAIL_LENGTH = 254;

const LOCAL_PART = /^[A-Za-z0-9._%+-]+$/;
const DOMAIN_HOST = /^[A-Za-z0-9.-]+$/;
const TOP_LEVEL_DOMAIN = /^[A-Za-z]{2,}$/;

/** True for an address like name@example.com: one @, a dotted domain, and a letters-only ending. */
export function isValidEmailFormat(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;

  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return false;

  const domain = email.slice(at + 1);
  const lastDot = domain.lastIndexOf('.');
  if (lastDot < 1) return false;

  return (
    LOCAL_PART.test(email.slice(0, at)) &&
    DOMAIN_HOST.test(domain.slice(0, lastDot)) &&
    TOP_LEVEL_DOMAIN.test(domain.slice(lastDot + 1))
  );
}

const TAG_OPEN = '[email:';
// Notes are limited to 1000 characters; anything far beyond that is refused by validation anyway,
// so it is not scanned here.
const MAX_SCAN_LENGTH = 5000;

function removeTagsOnce(text) {
  const lower = text.toLowerCase();
  let out = '';
  let from = 0;
  for (;;) {
    const start = lower.indexOf(TAG_OPEN, from);
    if (start === -1) break;
    const end = text.indexOf(']', start + TAG_OPEN.length);
    if (end === -1) break; // no closing bracket anywhere after this: nothing more to remove
    out += text.slice(from, start);
    from = end + 1;
  }
  return out + text.slice(from);
}

/**
 * Removes every `[Email: ...]` tag from free text, repeating until none is left (so a tag
 * hidden inside another cannot survive one pass). Linear in the length of the text.
 */
export function removeEmailTags(value) {
  let text = String(value || '');
  if (text.length > MAX_SCAN_LENGTH) return text;
  for (;;) {
    const next = removeTagsOnce(text);
    if (next === text) return text;
    text = next;
  }
}
