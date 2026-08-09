// Plain REST calls to the Gemini API — no SDK, keeps this service's
// dependency footprint tiny. Uses Node's built-in fetch (Node 18+).
//
// Embeddings only. Grounded answer generation lives in openrouter.js —
// Gemini's chat models kept 404ing as "no longer available to new users"
// for this key, so answer generation was moved to OpenRouter (routes to
// a free model) while embeddings (a different, non-chat endpoint) stayed
// here since gemini-embedding-001 has no OpenRouter equivalent.
import { GEMINI_API_KEY } from './env.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;

async function callGemini(path, body) {
  const url = `${API_BASE}/${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure (DNS, connection reset, etc.)
    throw new Error(`Gemini API request to ${path} failed (network error): ${err.message}`);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Gemini API returned non-JSON response from ${path}: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const message = json?.error?.message || res.statusText || 'unknown error';
    throw new Error(`Gemini API error from ${path} (HTTP ${res.status}): ${message}`);
  }

  return json;
}

/**
 * Embed a single piece of text with gemini-embedding-001, truncated to
 * EMBEDDING_DIMENSIONS via outputDimensionality (MRL truncation — loses
 * very little quality vs the native 3072-dim output).
 *
 * Throws on any failure or dimension mismatch — callers must not swallow
 * this, a bad embedding must never be silently stored or padded.
 */
export async function embedText(text, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
  if (!text || !text.trim()) {
    throw new Error('embedText: refusing to embed empty/blank text');
  }

  const json = await callGemini(`${EMBEDDING_MODEL}:embedContent`, {
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
    taskType,
  });

  const embedding = json?.embedding?.values;

  if (!Array.isArray(embedding)) {
    throw new Error(
      'Gemini embedContent returned no embedding values (unexpected response shape)'
    );
  }
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    // Hard fail rather than pad/truncate ourselves — a silent dimension
    // mismatch here would corrupt similarity search results.
    throw new Error(
      `Gemini returned a ${embedding.length}-dim embedding, expected ${EMBEDDING_DIMENSIONS}. ` +
        'Refusing to store — check outputDimensionality support for gemini-embedding-001.'
    );
  }

  return embedding;
}

/**
 * Embed many chunks. Sequential by default to stay well within free-tier
 * rate limits; call sites can parallelize later if needed.
 */
export async function embedTexts(texts, opts) {
  const results = [];
  for (const text of texts) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await embedText(text, opts));
  }
  return results;
}

export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL };
