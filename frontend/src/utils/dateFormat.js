// Date and time text shared by every page, so a date reads the same everywhere.
// An empty or unreadable value gives `fallback` (each page chooses its own wording).

export function formatDate(value, { fallback = "", locale = "en-US" } = {}) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value, { fallback = "", locale = "en-US", withYear = true } = {}) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(locale, {
    ...(withYear ? { year: "numeric" } : {}),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "23h 10m" / "45m" until `isoTime`; "" once it has passed.
export function formatWaitUntil(isoTime, now = Date.now()) {
  const ms = new Date(isoTime).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
