// Plain REST calls to OpenRouter's chat-completions endpoint (OpenAI-
// compatible), used only for grounded answer generation — embeddings stay
// on Gemini (see gemini.js), OpenRouter has no equivalent to
// gemini-embedding-001.
import { OPENROUTER_API_KEY } from './env.js';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Ordered list of free-tier models to try. This is used for BOTH Ask
// Swastha search and AI report summaries, so it hits OpenRouter's shared
// free-tier rate limit more than a single feature would — falling back to
// a different model on a 429 (vs. just failing) is what keeps both
// features usable under that shared limit. OpenRouter's free lineup
// rotates; if all of these start 404ing, check
// https://openrouter.ai/models?max_price=0 for current replacements.
const CHAT_MODELS = [
  'openrouter/free', // Auto-route to any available free model (recommended)
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3-8b-instruct:free',
  'qwen/qwen-2-7b-instruct:free',
  'mistralai/mistral-7b-instruct:free'
];

// Retryable with the next model: 429 (this model's shared free-tier quota
// exhausted) and 503 (provider momentarily overloaded — same reasoning as
// rag/src/config/gemini.js's multi-key retry). Anything else (400, 401,
// malformed response) is a real error that switching models won't fix.
const RETRYABLE_STATUSES = new Set([429, 503]);

async function callOpenRouterWithModel(prompt, model) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0, // deterministic, factual — not creative
      }),
    });
  } catch (err) {
    throw new Error(`OpenRouter request failed (network error): ${err.message}`);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`OpenRouter returned non-JSON response: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const message = json?.error?.message || res.statusText || 'unknown error';
    const error = new Error(`OpenRouter API error from ${model} (HTTP ${res.status}): ${message}`);
    error.status = res.status;
    throw error;
  }

  const choice = json?.choices?.[0];
  const answer = choice?.message?.content ?? '';

  if (!answer.trim()) {
    const error = new Error(
      `OpenRouter (${model}) returned no text (finish_reason: ${choice?.finish_reason || 'unknown'})`
    );
    throw error;
  }

  return answer.trim();
}

/**
 * Ask OpenRouter a grounded question, trying CHAT_MODELS in order and
 * falling back to the next one on a 429/503 — the free-tier rate limit is
 * shared across whichever model is used, so a different model has a real
 * chance of being available even when the first is saturated. Caller
 * supplies the full prompt (system instructions + excerpts + question
 * already composed) as a single user message.
 */
export async function generateGroundedAnswer(prompt) {
  let lastError;
  for (let i = 0; i < CHAT_MODELS.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await callOpenRouterWithModel(prompt, CHAT_MODELS[i]);
    } catch (err) {
      lastError = err;
      const isLastModel = i === CHAT_MODELS.length - 1;
      if (RETRYABLE_STATUSES.has(err.status) && !isLastModel) {
        console.warn(
          `[openrouter] model ${i + 1}/${CHAT_MODELS.length} (${CHAT_MODELS[i]}) failed (HTTP ${err.status}), trying next model...`
        );
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export { CHAT_MODELS };
