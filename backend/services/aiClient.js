// Shared AI failover client — every Gemini/OpenRouter call goes through here.
//
// MIRRORED FILE: rag/src/config/aiClient.js is the primary copy; this is a
// byte-identical copy except for the key/env resolution block right below
// (backend has no config/env.js — server.js loads dotenv directly, so
// process.env is already populated by the time this module is imported).
// If you change one file, change the other. See ai-failover-design.md §1 for
// why this is vendored rather than shared via a workspace package.
//
// Design contract (ai-failover-design.md):
//   - rotate all keys before changing model, all models before changing provider
//   - never throw to the user for generation/vision-ocr — return a degraded result
//   - embeddings are the ONE exception: they throw, because a silently unindexed
//     report is permanently unfindable (§9, confirmed with the user)
//   - never log a key value; reference keys as key#N/M only

// GEMINI_API_KEYS (plural, comma-separated) added alongside the existing
// singular GEMINI_API_KEY this session so backend can rotate across the same
// 4 keys rag/ already uses. Falls back to the singular key for safety if the
// plural var is ever unset, so nothing regresses if .env reverts.
const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // unset in backend/.env today — generation/vision-ocr fall through to degraded if Gemini is exhausted, never to OpenRouter, until this is configured.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = 768;

// Model ladders per task. Verified live 2026-08-19: gemini-2.0-flash is RETIRED
// (404 "no longer available") and was removed — it was the cert parser's only
// fallback. flash-lite answered 200, flash-latest answered 503, which is exactly
// the transient case this ladder exists for.
const MODEL_LADDER = {
  'vision-ocr': ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.1-flash-lite'],
  generation: ['gemini-flash-lite-latest', 'gemini-flash-latest'],
  // Same ladder as 'generation' (dialogue turns are short text+JSON, same
  // as search/lab-insights — no reason for a different model list), just a
  // distinct task key so runAI's per-task timeout/label stay separate from
  // the generic 'generation' task. Confirmed with the user (Module A PRD).
  'intake-dialogue': ['gemini-flash-lite-latest', 'gemini-flash-latest'],
  embedding: [EMBEDDING_MODEL],
};

// Only used if live discovery fails. Verified still present in OpenRouter's
// catalogue; the other 4 slugs the old hardcoded chain used are all gone.
const OPENROUTER_SAFE_DEFAULT = ['openrouter/free'];

const TIMEOUT_MS = { embedding: 20000, 'vision-ocr': 45000, generation: 30000, 'intake-dialogue': 30000 };

export const FRIENDLY_FALLBACK =
  "Swastha couldn't process this right now. Please try again shortly.";

// Keys that returned an auth-shaped error are skipped for the rest of the
// process lifetime — no point paying a round-trip on a revoked key every call.
const deadKeys = new Set();
// Round-robin start offset so key#1 isn't always the one burned first.
let keyCursor = 0;

/** Classify a failure into the taxonomy in ai-failover-design.md §3. */
function classify(status, bodyText) {
  const body = (bodyText || '').toUpperCase();
  if (status === 429 || body.includes('RESOURCE_EXHAUSTED')) return 'RATE_LIMIT';
  if (status === 401 || status === 403) return 'KEY_DEAD';
  if (status === 400 && (body.includes('API_KEY_INVALID') || body.includes('API KEY NOT VALID'))) {
    return 'KEY_DEAD';
  }
  if (status === 404 || body.includes('NOT_FOUND')) return 'MODEL_GONE';
  if (status === 0 || status >= 500) return 'TRANSIENT';
  if (status === 400) return 'BAD_REQUEST'; // malformed/oversized — fails everywhere
  return 'TRANSIENT';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    // Network/DNS/abort — status 0 maps to TRANSIENT.
    return { status: 0, ok: false, text: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Ordered list of usable keys, starting at the round-robin cursor. */
function liveKeys() {
  const all = GEMINI_API_KEYS.filter((_, i) => !deadKeys.has(i));
  if (all.length === 0) return [];
  const offset = keyCursor % GEMINI_API_KEYS.length;
  const idx = GEMINI_API_KEYS.map((k, i) => i).filter((i) => !deadKeys.has(i));
  const rotated = [...idx.slice(offset), ...idx.slice(0, offset)];
  return rotated.map((i) => ({ key: GEMINI_API_KEYS[i], index: i }));
}

function geminiBody(task, { input, file, json, taskType }) {
  if (task === 'embedding') {
    return {
      content: { parts: [{ text: input }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: taskType || 'RETRIEVAL_DOCUMENT',
    };
  }
  const parts = [];
  if (file) parts.push({ inlineData: { mimeType: file.mime, data: file.data } });
  parts.push({ text: input });
  const body = { contents: [{ parts }] };
  // temperature 0 preserves the deterministic/factual behaviour the previous
  // OpenRouter path used — these are medical records, not creative writing.
  body.generationConfig = json
    ? { responseMimeType: 'application/json', temperature: 0 }
    : { temperature: 0 };
  // vision-ocr with a multi-page/dense PDF (vs. a single-page JPG/PNG photo)
  // produces much longer transcriptions — numbered medicine/notes lists for
  // every page. Without an explicit cap, the model default was truncating
  // mid-JSON on these, which JSON.parse then threw on downstream, always as
  // a non-transient failure (never hit the retry/failover path since every
  // model+key truncates the same real document identically). Gemini 2.x/3.x
  // flash models support up to 8192 output tokens.
  if (task === 'vision-ocr') {
    body.generationConfig.maxOutputTokens = 8192;
  }
  return body;
}

function parseGemini(task, text) {
  const json = text ? JSON.parse(text) : {};
  if (task === 'embedding') {
    const values = json?.embedding?.values;
    if (!Array.isArray(values)) throw new Error('no embedding values in response');
    if (values.length !== EMBEDDING_DIMENSIONS) {
      // Hard fail: a silent dimension mismatch corrupts similarity search.
      throw new Error(`got ${values.length}-dim embedding, expected ${EMBEDDING_DIMENSIONS}`);
    }
    return { embedding: values };
  }
  const candidate = json?.candidates?.[0];
  const out = (candidate?.content?.parts || []).map((p) => p.text).join('');
  if (!out.trim()) throw new Error(`empty text (finishReason: ${candidate?.finishReason})`);
  // Any finishReason other than STOP means `out` may be incomplete —
  // MAX_TOKENS is the common case (length cap hit) but treat any non-STOP
  // reason as suspect for a json:true caller, since a json:true caller
  // (e.g. vision-ocr) will otherwise fail JSON.parse downstream with a
  // confusing "non-JSON extraction result" error that gives no hint this
  // was actually a cutoff.
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`response incomplete (finishReason: ${candidate.finishReason}, ${out.length} chars)`);
  }
  return { text: out.trim() };
}

// ---- OpenRouter live free-model discovery (ai-failover-design.md §5) ----
let orCache = { models: null, at: 0 };
// Separate cache for vision-capable free models — a vision-ocr task (e.g.
// certificate verification) must never fall back to a text-only model,
// since that silently drops the uploaded image and the model then either
// hallucinates fields or returns non-JSON prose that fails JSON.parse in
// certificateParserService.js, surfacing as a generic error with no
// indication the real cause was "no vision-capable fallback was used".
let orVisionCache = { models: null, at: 0 };
const OR_TTL_MS = 6 * 60 * 60 * 1000;
// No known free vision-capable model as of writing this comment — if
// discovery finds none, vision-ocr has nowhere left to go after Gemini is
// exhausted and correctly returns degraded() rather than silently guessing
// with a text-only model.
const OPENROUTER_VISION_SAFE_DEFAULT = [];

async function freeOpenRouterModels({ vision = false } = {}) {
  const cache = vision ? orVisionCache : orCache;
  if (cache.models && Date.now() - cache.at < OR_TTL_MS) return cache.models;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(OPENROUTER_MODELS_URL, { signal: controller.signal });
    clearTimeout(timer);
    const data = (await res.json())?.data || [];
    const free = data
      .filter((m) => m.pricing && parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0)
      // The :free suffix + text modality check matters: some $0 models are audio
      // (e.g. lyria) and would otherwise be picked to write a medical summary.
      .filter((m) => m.id.endsWith(':free'))
      .filter((m) => (m.architecture?.output_modalities || ['text']).includes('text'))
      .filter((m) => !vision || (m.architecture?.input_modalities || []).includes('image'))
      .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
      .slice(0, 3)
      .map((m) => m.id);
    const models = vision ? free : [...free, ...OPENROUTER_SAFE_DEFAULT];
    if (vision) {
      orVisionCache = { models, at: Date.now() };
    } else {
      orCache = { models, at: Date.now() };
    }
    return models;
  } catch {
    // Reuse last good list if we have one, else the safe default. Never block.
    return cache.models || (vision ? OPENROUTER_VISION_SAFE_DEFAULT : OPENROUTER_SAFE_DEFAULT);
  }
}

/**
 * Single entry point for all AI work.
 * @returns {Promise<{ok, text?, embedding?, model_used, provider, degraded, attempts}>}
 *   Resolves even on total failure (degraded:true) — EXCEPT task 'embedding',
 *   which throws, by design.
 */
export async function runAI({ task, input, file, json = false, taskType, label = task }) {
  if (!task || !MODEL_LADDER[task]) throw new Error(`runAI: unknown task "${task}"`);
  if (task === 'embedding' && (!input || !input.trim())) {
    throw new Error('runAI: refusing to embed empty text');
  }
  if (task === 'vision-ocr' && (!file?.data || !file?.mime)) {
    throw new Error('runAI: vision-ocr requires file {data, mime}');
  }

  const timeout = TIMEOUT_MS[task];
  const trail = [];
  let attempts = 0;

  // ---- Provider 1: Gemini (models outer, keys inner) ----
  for (const model of MODEL_LADDER[task]) {
    const path = task === 'embedding' ? `${model}:embedContent` : `${model}:generateContent`;
    let modelGone = false;

    for (const { key, index } of liveKeys()) {
      for (let tryNo = 1; tryNo <= 2; tryNo += 1) {
        attempts += 1;
        const r = await postJson(
          `${GEMINI_BASE}/${path}`,
          { 'x-goog-api-key': key },
          geminiBody(task, { input, file, json, taskType }),
          timeout
        );

        if (r.ok) {
          try {
            const parsed = parseGemini(task, r.text);
            keyCursor += 1;
            return { ok: true, ...parsed, model_used: model, provider: 'gemini', degraded: false, attempts };
          } catch (err) {
            // 200 but unusable body — treat as transient, move on.
            trail.push(`gemini/${model} key#${index + 1}: bad body: ${err.message}`);
            break;
          }
        }

        const cls = classify(r.status, r.text);
        trail.push(`gemini/${model} key#${index + 1}/${GEMINI_API_KEYS.length}: HTTP ${r.status} ${cls}`);

        if (cls === 'BAD_REQUEST') {
          // Fails identically on every key and model — don't burn the ladder.
          logTrail(label, trail);
          return degraded(attempts, 'BAD_REQUEST', task);
        }
        if (cls === 'KEY_DEAD') {
          deadKeys.add(index);
          break; // next key
        }
        if (cls === 'MODEL_GONE') {
          modelGone = true; // every key agrees — skip to next model
          break;
        }
        if (cls === 'TRANSIENT' && tryNo === 1) {
          await sleep(800);
          continue; // one same-key retry
        }
        break; // RATE_LIMIT or exhausted retries -> next key
      }
      if (modelGone) break;
    }
  }

  // ---- Provider 2: OpenRouter (generation + vision-ocr only) ----
  if (task !== 'embedding' && OPENROUTER_API_KEY) {
    const isVision = task === 'vision-ocr' && file?.data && file?.mime;
    // A vision-ocr task MUST use a vision-capable model here — sending the
    // image to a text-only free model silently drops it, and the model
    // then either hallucinates fields or returns non-JSON prose that fails
    // JSON.parse upstream. If no free vision model is available,
    // openRouterModels returns [] for vision and this loop simply does
    // nothing, falling through to "everything exhausted" below — which is
    // the honest result.
    const openRouterModels = await freeOpenRouterModels({ vision: isVision });
    // OpenAI-compatible multimodal content: an array of text/image_url
    // parts instead of a bare string. Only built when there's actually an
    // image to send — a plain generation call keeps the simple string
    // content it always used.
    const content = isVision
      ? [
          { type: 'text', text: input },
          { type: 'image_url', image_url: { url: `data:${file.mime};base64,${file.data}` } },
        ]
      : input;

    for (const model of openRouterModels) {
      attempts += 1;
      const r = await postJson(
        OPENROUTER_URL,
        { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
        { model, messages: [{ role: 'user', content }], temperature: 0 },
        timeout
      );

      if (r.ok) {
        try {
          const body = JSON.parse(r.text);
          const out = body?.choices?.[0]?.message?.content;
          if (out && out.trim()) {
            return { ok: true, text: out.trim(), model_used: model, provider: 'openrouter', degraded: false, attempts };
          }
          trail.push(`openrouter/${model}: empty content`);
        } catch (err) {
          trail.push(`openrouter/${model}: unparsable: ${err.message}`);
        }
        continue;
      }
      trail.push(`openrouter/${model}: HTTP ${r.status} ${classify(r.status, r.text)}`);
    }
  }

  // ---- Everything exhausted ----
  logTrail(label, trail);
  if (task === 'embedding') {
    // Deliberate: a silently unindexed report is permanently unfindable (§9).
    throw new Error(`runAI(embedding) exhausted all keys after ${attempts} attempts: ${trail.join(' | ')}`);
  }
  return degraded(attempts, 'ALL_PROVIDERS_EXHAUSTED', task);
}

function degraded(attempts, code, task) {
  return {
    ok: false,
    text: FRIENDLY_FALLBACK,
    embedding: null,
    model_used: null,
    provider: null,
    degraded: true,
    attempts,
    error_code: code,
    task,
  };
}

function logTrail(label, trail) {
  // Server-side only, and never a key value — "silent to the user" is not
  // "silent in the logs" (ai-failover-design.md §2).
  console.error(`[aiClient:${label}] all attempts failed:\n  ${trail.join('\n  ')}`);
}

export const __testing = { classify, deadKeys, freeOpenRouterModels };
