// Thin wrappers over TinyFish's Search (GET) and Fetch (POST) APIs. Retrieval
// only — page text returned here is never sent to an AI model. The API key is
// read at call time (not import time) because routes are statically imported
// before server.js's dotenv.config() runs.

const SEARCH_URL = 'https://api.search.tinyfish.ai';
const FETCH_URL = 'https://api.fetch.tinyfish.ai';

export class TinyFishError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'TinyFishError';
    this.status = status;
    // 'not_configured' | 'quota' | 'rate_limited' | 'unavailable'
    this.code = code || 'unavailable';
  }
}

function apiKey() {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new TinyFishError('TINYFISH_API_KEY is not set', { code: 'not_configured' });
  return key;
}

function errorForStatus(status, what) {
  if (status === 402) return new TinyFishError(`${what}: allowance exhausted`, { status, code: 'quota' });
  if (status === 429) return new TinyFishError(`${what}: rate limited`, { status, code: 'rate_limited' });
  return new TinyFishError(`${what} failed with status ${status}`, { status });
}

async function timedFetch(url, options, timeoutMs, what) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new TinyFishError(`${what} request failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  }
}

/**
 * @returns {Promise<Array<{ title, snippet, url, date, siteName }>>}
 */
export async function tinyfishSearch({ query, includeDomains, purpose, location }) {
  const key = apiKey();
  const params = new URLSearchParams({ query });
  if (includeDomains?.length) params.set('include_domains', includeDomains.join(','));
  if (purpose) params.set('purpose', purpose);
  if (location) params.set('location', location);

  const res = await timedFetch(
    `${SEARCH_URL}?${params.toString()}`,
    { method: 'GET', headers: { 'X-API-Key': key } },
    15000,
    'TinyFish search'
  );
  if (!res.ok) throw errorForStatus(res.status, 'TinyFish search');

  const data = await res.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter((r) => r && typeof r.url === 'string')
    .map((r) => ({
      title: r.title || '',
      snippet: r.snippet || '',
      url: r.url,
      date: r.date || null,
      siteName: r.site_name || '',
    }));
}

/**
 * Fetches up to 10 URLs as markdown. Per-URL failures (bot_blocked, timeout,
 * empty_content, ...) come back in `errors`, not as a thrown error — only a
 * request-level failure throws.
 * @returns {Promise<{ pages: Map<string, { text: string, title: string|null, date: string|null }>, errors: Array<{ url, error }> }>}
 */
export async function tinyfishFetch({ urls, purpose, perUrlTimeoutMs = 10000 }) {
  const key = apiKey();
  const res = await timedFetch(
    FETCH_URL,
    {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls,
        format: 'markdown',
        per_url_timeout_ms: perUrlTimeoutMs,
        ...(purpose ? { purpose } : {}),
      }),
    },
    perUrlTimeoutMs + 8000,
    'TinyFish fetch'
  );
  if (!res.ok) throw errorForStatus(res.status, 'TinyFish fetch');

  const data = await res.json().catch(() => null);
  const pages = new Map();
  for (const r of Array.isArray(data?.results) ? data.results : []) {
    if (typeof r?.text !== 'string' || !r.text.trim()) continue;
    const entry = { text: r.text, title: r.title || null, date: r.published_date || null };
    pages.set(r.url, entry);
    if (r.final_url) pages.set(r.final_url, entry);
  }
  return { pages, errors: Array.isArray(data?.errors) ? data.errors : [] };
}
