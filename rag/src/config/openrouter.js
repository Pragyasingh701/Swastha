// Plain REST calls to OpenRouter's chat-completions endpoint (OpenAI-
// compatible), used only for grounded answer generation — embeddings stay
// on Gemini (see gemini.js), OpenRouter has no equivalent to
// gemini-embedding-001.
import { OPENROUTER_API_KEY } from './env.js';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Free-tier model. OpenRouter's free lineup rotates — if this starts
// 404ing, check https://openrouter.ai/models?max_price=0 for a current
// replacement and swap it in here.
const CHAT_MODEL = 'openai/gpt-oss-20b:free';

/**
 * Ask the configured OpenRouter model a grounded question. Caller supplies
 * the full prompt (system instructions + excerpts + question already
 * composed) as a single user message.
 */
export async function generateGroundedAnswer(prompt) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
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
    throw new Error(`OpenRouter API error (HTTP ${res.status}): ${message}`);
  }

  const choice = json?.choices?.[0];
  const answer = choice?.message?.content ?? '';

  if (!answer.trim()) {
    throw new Error(
      `OpenRouter returned no text (finish_reason: ${choice?.finish_reason || 'unknown'})`
    );
  }

  return answer.trim();
}

export { CHAT_MODEL };
