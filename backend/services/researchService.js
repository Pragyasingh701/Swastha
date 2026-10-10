// Doctor Research Assistant pipeline: validate a public medical question,
// search an allowlist of official sources via TinyFish, read the top pages,
// and return plain-text cards. Retrieval only — no AI model ever sees page
// text, and nothing is stored.
import { INDIA_SOURCES, GLOBAL_SOURCES, matchSource } from '../config/researchSources.js';
import { tinyfishSearch, tinyfishFetch, TinyFishError } from './tinyfishService.js';

// Per region, so the India/Global filter on the results page always has
// something to show. Page reading (the costly part: Fetch is capped at 1,000
// URLs/day on the free tier) covers only the top few of each region.
const MAX_RESULTS_PER_REGION = 6;
const FETCH_TOP_N_PER_REGION = 3;
const EXCERPT_MAX_CHARS = 500;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
// Page text is cached per URL (the same guideline PDF turns up across many
// queries), truncated and bounded so memory stays small.
const PAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_CACHE_MAX_ENTRIES = 60;
const PAGE_CACHE_MAX_CHARS = 120000;
// TinyFish's free Fetch allowance is 1,000 URLs/day (resets 00:00 UTC). Stay
// under it with margin, since this counter resets if the server restarts.
const DAILY_FETCH_URL_BUDGET = 900;

// ---- Query validation ------------------------------------------------------

// Doctors are told not to enter patient identifiers; this is the backstop for
// the obvious shapes. A rejected query never leaves the server.
const PII_PATTERNS = [
  { re: /[^\s@]+@[^\s@]+\.[^\s@]+/, what: 'an email address' },
  { re: /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/, what: 'a phone number' },
  { re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, what: 'an Aadhaar-style number' },
  { re: /\b\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, what: 'an ABHA-style number' },
  { re: /\b\d{6}\b/, what: 'a patient code' },
  { re: /\d{10,}/, what: 'a long identifier' },
];

/** @returns {{ ok: true, query: string } | { ok: false, message: string }} */
export function validateQuery(raw) {
  if (typeof raw !== 'string') return { ok: false, message: 'Enter a medical question to search for.' };
  // eslint-disable-next-line no-control-regex
  const query = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (query.length < 3) return { ok: false, message: 'Enter at least 3 characters.' };
  if (query.length > 200) return { ok: false, message: 'Keep the question under 200 characters.' };
  for (const { re, what } of PII_PATTERNS) {
    if (re.test(query)) {
      return {
        ok: false,
        message: `This looks like it contains ${what}. Remove personal identifiers and ask a general medical question.`,
      };
    }
  }
  return { ok: true, query };
}

// ---- Excerpt extraction ----------------------------------------------------

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'what', 'how', 'are', 'was', 'were', 'who', 'why', 'when', 'which',
  'does', 'do', 'did', 'can', 'could', 'should', 'would', 'from', 'that', 'this', 'these', 'those',
  'about', 'into', 'than', 'then', 'there', 'their', 'have', 'has', 'had', 'not', 'any', 'all',
  'tell', 'me', 'please', 'guidance', 'protocol', 'guidelines', 'guideline',
]);

// Function words real explanatory prose is full of and contents lists, headers
// and citation lines are not.
const PROSE_WORDS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'should', 'may', 'can', 'must', 'will', 'the', 'of',
  'and', 'to', 'in', 'with', 'for', 'that', 'which', 'by', 'or', 'as', 'it', 'its', 'has', 'have',
]);

// Words that signal a sentence states something clinically useful.
const CUE_RE = /\b(is a|is an|are|caused by|characterized|symptoms?|signs?|diagnos\w+|treat\w+|manag\w+|recommend\w+|should|first[- ]line|dose|dosage|contraindicat\w+|risk|complications?|prevent\w+|therapy|monitor\w+)\b/i;

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function markdownToPlain(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/https?:\/\/\S+/g, ' ');
}

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  if (lastSentence > max * 0.5) return cut.slice(0, lastSentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max).trim()}…`;
}

// A usable sentence reads like prose: sensible length, mostly letters, not a
// run of section numbers ("1 1.1 Global scenario 1 1.2 ..."), not mostly
// UPPERCASE, and containing ordinary function words.
function isProseSentence(sentence) {
  if (sentence.length < 40 || sentence.length > 400) return false;
  if (/^(chapter|table of contents|contents|page|figure|table|annex|appendix|acknowledg|abbreviations|references?)\b/i.test(sentence)) return false;
  if (sentence.includes('|')) return false;

  const letters = sentence.match(/[a-z]/gi) || [];
  if (letters.length < sentence.length * 0.65) return false;
  const upper = sentence.match(/[A-Z]/g) || [];
  if (upper.length > letters.length * 0.3) return false;

  const words = sentence.split(/\s+/);
  const numeric = words.filter((w) => /^\(?\d+([.\-–]\d+)*\)?[.,;:]?$/.test(w)).length;
  if (numeric > words.length * 0.12) return false;

  // Runs of ALL-CAPS words (YES / NO / headings) are chart labels, not prose.
  const shouty = words.filter((w) => /^[A-Z]{2,}[.,:;]?$/.test(w)).length;
  if (shouty > words.length * 0.15) return false;

  // Flowchart/table residue ("YES YES NO NO ..."): few distinct words.
  const distinct = new Set(words.map((w) => w.toLowerCase()));
  if (distinct.size < words.length * 0.6) return false;

  // Navigation/menu text ("On this page Basics Summary Diagnosis ..."): a run
  // of Capitalized Words rather than a sentence.
  const capitalized = words.filter((w) => /^[A-Z][a-z]/.test(w)).length;
  if (words.length >= 8 && capitalized > words.length * 0.4) return false;

  // Scanned-document OCR garbage: lots of stray single characters.
  const strays = words.filter((w) => w.length === 1 && !/^[aAI0-9]$/.test(w)).length;
  if (strays > words.length * 0.05) return false;

  const proseHits = words.filter((w) => PROSE_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length;
  return proseHits >= 3 && words.length >= 7;
}

// Sentences grouped by paragraph, so a chosen sentence can pull in its
// neighbor for context without crossing into unrelated text.
function sentencesByParagraph(markdown) {
  return markdownToPlain(markdown)
    .split(/\n\s*\n/)
    .map((para) => para.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((para) => para.split(/(?<=[.!?])\s+(?=[A-Z])/).map((x) => x.trim()));
}

/** The most informative 1–3 consecutive sentences for the query, '' if none. */
export function pickExcerpt(markdown, query) {
  const queryTokens = new Set(tokenize(query));
  const flat = [];
  for (const [p, sentences] of sentencesByParagraph(markdown).entries()) {
    sentences.forEach((text, i) => flat.push({ p, i, text, ok: isProseSentence(text) }));
  }
  const good = flat.filter((x) => x.ok);
  if (good.length === 0) return '';

  const scored = good.map((x) => {
    const tokens = new Set(tokenize(x.text));
    let hits = 0;
    for (const t of queryTokens) if (tokens.has(t)) hits += 1;
    const coverage = queryTokens.size ? hits / queryTokens.size : 0;
    return { ...x, score: coverage * 3 + (CUE_RE.test(x.text) ? 1 : 0) };
  });

  // Best sentence; with no query overlap at all, fall back to the opening
  // prose of the page (usually its summary or definition).
  const anchor = scored.some((x) => x.score >= 1)
    ? scored.reduce((best, x) => (x.score > best.score ? x : best))
    : scored[0];

  // Grow forward through the same paragraph while it stays useful and short.
  const picked = [anchor.text];
  const sameParagraph = flat.filter((x) => x.p === anchor.p);
  let idx = sameParagraph.findIndex((x) => x.i === anchor.i);
  while (picked.join(' ').length < 220 && picked.length < 3) {
    const next = sameParagraph[++idx];
    if (!next || !next.ok) break;
    if (picked.join(' ').length + next.text.length > EXCERPT_MAX_CHARS) break;
    picked.push(next.text);
  }
  return truncate(picked.join(' '), EXCERPT_MAX_CHARS);
}

// ---- Cache -----------------------------------------------------------------

const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

const pageCache = new Map();

function pageCacheGet(url) {
  const hit = pageCache.get(url);
  if (!hit) return null;
  if (Date.now() - hit.at > PAGE_CACHE_TTL_MS) {
    pageCache.delete(url);
    return null;
  }
  return hit.page;
}

function pageCacheSet(url, page) {
  if (pageCache.size >= PAGE_CACHE_MAX_ENTRIES) pageCache.delete(pageCache.keys().next().value);
  pageCache.set(url, { at: Date.now(), page: { ...page, text: page.text.slice(0, PAGE_CACHE_MAX_CHARS) } });
}

// ---- Fetch budget ----------------------------------------------------------

const fetchBudget = { day: '', used: 0 };

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

function fetchBudgetRemaining() {
  if (fetchBudget.day !== utcDay()) {
    fetchBudget.day = utcDay();
    fetchBudget.used = 0;
  }
  return Math.max(0, DAILY_FETCH_URL_BUDGET - fetchBudget.used);
}

// ---- Pipeline --------------------------------------------------------------

// "Asthma  inhaler?" and "asthma inhaler" are the same search — one cache
// entry, one upstream call.
function normalizeQuery(query) {
  return query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Identical searches already running share one upstream call, so a room of
// doctors tapping the same example chip costs the same as one doctor.
const inFlight = new Map();

async function searchRegion(query, sources, location) {
  const found = await tinyfishSearch({
    query,
    includeDomains: sources.map((s) => s.domain),
    purpose: 'Clinical reference lookup by a physician; official health sources only.',
    location,
  });
  // Re-check every hostname ourselves rather than trusting include_domains.
  const seen = new Set();
  const candidates = [];
  for (const r of found) {
    const source = matchSource(r.url, sources);
    if (!source || seen.has(r.url)) continue;
    seen.add(r.url);
    candidates.push({ ...r, source });
    if (candidates.length === MAX_RESULTS_PER_REGION) break;
  }
  return candidates;
}

/**
 * Always searches both regions so the page's India/Global toggle can filter
 * the results client-side without another request.
 * @returns {Promise<{ retrievedAt: string, results: Array<{ source, region,
 *   domain, title, url, date, excerpt, excerptFrom }>,
 *   notice: null|'no_results'|'partial' }>}
 */
export function runResearch({ query }) {
  const key = normalizeQuery(query);
  const cached = cacheGet(key);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(key);
  if (running) return running;

  const promise = doResearch({ query, cacheKey: key }).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function doResearch({ query, cacheKey }) {
  const [india, global] = await Promise.allSettled([
    searchRegion(query, INDIA_SOURCES, 'IN'),
    searchRegion(query, GLOBAL_SOURCES, 'US'),
  ]);
  // One region failing still leaves the other usable; both failing is a
  // real outage, so surface the first error.
  if (india.status === 'rejected' && global.status === 'rejected') throw india.reason;
  for (const r of [india, global]) {
    if (r.status === 'rejected') console.warn(`[research] one region search failed: ${r.reason?.message}`);
  }
  const indiaCandidates = india.status === 'fulfilled' ? india.value : [];
  const globalCandidates = global.status === 'fulfilled' ? global.value : [];
  const candidates = [...indiaCandidates, ...globalCandidates];

  if (candidates.length === 0) {
    return { retrievedAt: new Date().toISOString(), results: [], notice: 'no_results' };
  }

  const toRead = new Set([
    ...indiaCandidates.slice(0, FETCH_TOP_N_PER_REGION),
    ...globalCandidates.slice(0, FETCH_TOP_N_PER_REGION),
  ].map((c) => c.url));

  // Page reading is an enhancement: if it fails outright, or the daily
  // budget is spent, fall back to snippets rather than failing the search.
  // Only URLs not already in the page cache are fetched, in one batch.
  const pages = new Map();
  const missing = [];
  for (const url of toRead) {
    const cachedPage = pageCacheGet(url);
    if (cachedPage) pages.set(url, cachedPage);
    else missing.push(url);
  }
  if (missing.length > 0) {
    if (missing.length > fetchBudgetRemaining()) {
      console.warn('[research] daily Fetch budget reached, using snippets only');
    } else {
      fetchBudget.used += missing.length;
      try {
        const fetched = await tinyfishFetch({
          urls: missing,
          purpose: `Find passages answering: ${query}`,
        });
        for (const url of missing) {
          const page = fetched.pages.get(url);
          if (!page) continue;
          pages.set(url, page);
          pageCacheSet(url, page);
        }
      } catch (err) {
        if (!(err instanceof TinyFishError)) throw err;
        // A 402 means the real allowance is gone — stop trying until tomorrow.
        if (err.code === 'quota') fetchBudget.used = DAILY_FETCH_URL_BUDGET;
        console.warn(`[research] page fetch failed, using snippets: ${err.message}`);
      }
    }
  }

  let partial = false;
  const results = candidates.map((c) => {
    const page = pages.get(c.url);
    const pageExcerpt = page ? pickExcerpt(page.text, query) : '';
    if (toRead.has(c.url) && !pageExcerpt) partial = true;
    return {
      source: c.source.label,
      region: c.source.region,
      domain: new URL(c.url).hostname,
      title: c.title || page?.title || c.url,
      url: c.url,
      date: c.date || page?.date || null,
      excerpt: pageExcerpt || truncate(c.snippet.replace(/\s+/g, ' ').trim(), EXCERPT_MAX_CHARS),
      excerptFrom: pageExcerpt ? 'page' : 'snippet',
    };
  });

  const value = { retrievedAt: new Date().toISOString(), results, notice: partial ? 'partial' : null };
  cacheSet(cacheKey, value);
  return value;
}
