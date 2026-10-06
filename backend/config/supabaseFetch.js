// fetch for the Supabase clients: retries a WRITE whose connection never opened.
//
// supabase-js already retries reads (GET/HEAD/OPTIONS) on a network error, up
// to 3 times, but never writes, so a single failed connection on a write goes
// straight back to the caller. That is how an intake turn was lost after its
// model call had already run: the save at the end (a PATCH) failed with
// "TypeError: fetch failed", cause UND_ERR_CONNECT_TIMEOUT.
//
// Retrying a write is only safe when the request never reached Supabase, so
// this retries ONLY failures from before the connection opened (connect
// timeout, refused, unreachable, DNS). A reset or timeout on a connection that
// was already open is never retried: the write may have landed, and doing it
// twice could duplicate an insert.

const CONNECT_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', // undici: the TCP connect itself timed out
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND', // DNS lookup failed, so nothing was sent
  'EAI_AGAIN',
]);

// supabase-js retries these itself; retrying them here as well would multiply
// the attempts on a network that is down.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const MAX_WRITE_RETRIES = 2;

function failedBeforeConnecting(err) {
  const cause = err?.cause;
  if (!cause) return false;
  if (CONNECT_ERROR_CODES.has(cause.code)) return true;
  // When several addresses were tried (IPv4 and IPv6), Node reports an
  // AggregateError, and every attempt in it has to have failed to connect.
  if (Array.isArray(cause.errors) && cause.errors.length > 0) {
    return cause.errors.every((e) => CONNECT_ERROR_CODES.has(e?.code) || e?.syscall === 'connect');
  }
  return cause.syscall === 'connect';
}

// A body that can be sent again as-is. A stream is used up by the first try.
function canResend(body) {
  return body == null
    || typeof body === 'string'
    || body instanceof ArrayBuffer
    || ArrayBuffer.isView(body)
    || body instanceof Blob
    || body instanceof FormData
    || body instanceof URLSearchParams;
}

// "UND_ERR_CONNECT_TIMEOUT (tried 64:ff9b::ac40:95f6:443)". supabase-js only
// ever reports "TypeError: fetch failed", which hides why it failed: a
// connection that never opened (a network problem) looks the same as anything
// else.
function describeFailure(err) {
  const cause = err?.cause;
  const what = cause?.code || cause?.name || err?.name || 'network error';
  const tried = /attempted addresses: (.*?), timeout/.exec(cause?.message || '')?.[1];
  return tried ? `${what} (tried ${tried})` : what;
}

/**
 * Drop-in `fetch` for createClient's `global.fetch` option.
 * @param {string|URL} input
 * @param {RequestInit} [init]
 */
export async function supabaseFetch(input, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const retryable = !READ_METHODS.has(method) && canResend(init.body);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (err) {
      if (err?.name === 'AbortError' || init.signal?.aborted) throw err;
      const retry = retryable && attempt <= MAX_WRITE_RETRIES && failedBeforeConnecting(err);
      // Logged for reads too: they pass through here on every attempt, including
      // supabase-js's own retries, so this is the one place the real cause shows.
      console.warn(
        `[supabase] ${method} could not reach Supabase: ${describeFailure(err)}`
          + (retry ? ` — retrying ${attempt}/${MAX_WRITE_RETRIES}` : READ_METHODS.has(method) ? ' — supabase-js retries reads' : '')
      );
      if (!retry) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}
