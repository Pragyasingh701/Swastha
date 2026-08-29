// Module A — Voice Layer (Phase 7a): text-to-speech for intake questions.
//
// Deliberately NOT routed through config/aiClient.js. That client's ladder
// is shaped for LLM text completions — key rotation across 4 Gemini keys,
// model ladders, JSON/prose output, a FRIENDLY_FALLBACK *sentence* as the
// degraded value. None of that maps onto speech synthesis (there is no
// "friendly sentence" fallback for audio, and the two providers here take
// completely different request shapes). What IS reused is the philosophy
// from ai-failover-design.md: classify the failure, try the next provider,
// and never throw to the user — a TTS hiccup degrades to a lesser voice,
// it never breaks the intake session (Voice Layer PRD §3, §7a.1).
//
// Provider order:
//   1. Sarvam Bulbul v3 — primary. Handles Indic prosody properly.
//   2. edge-tts-universal — fallback. Free, no key, in-process pure JS
//      (replaces the old standalone Python Flask edge-tts prototype).
//
// Returns base64 inline for the caller to embed in JSON (PRD: no Supabase
// Storage / signed-URL setup for this phase, and audio is played inline
// rather than served as a forced download).
import { Buffer } from 'node:buffer';
import { EdgeTTS } from 'edge-tts-universal';
import { currentKey, retireKey, __resetKeyPool } from '../config/sarvamKeys.js';

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

// Bulbul v3. Speaker confirmed with the user: `shubh` for BOTH languages,
// with only target_language_code changing. One voice for the whole session
// on purpose — an elderly or low-literacy patient hearing the speaker's
// identity change mid-intake is the same confusion PRD §6 rejected
// per-turn language auto-detection to avoid.
const SARVAM_MODEL = 'bulbul:v3';
const SARVAM_SPEAKER = 'shubh';
// Slightly under 1.0 — this audience is the reason the voice layer exists;
// default pace reads too fast for a first-visit OPD patient.
const SARVAM_PACE = 0.9;
const SARVAM_SAMPLE_RATE = 22050;
// bulbul:v3 caps at 2500 chars. Intake questions are one or two sentences,
// so this is a guard against a runaway prompt, not a real constraint.
const SARVAM_MAX_CHARS = 2500;

// edge-tts voices, per language. The old Python prototype defaulted to
// en-US-JennyNeural, which mangles Hindi outright — the fallback is a
// *lesser* voice, not a wrong-language one.
const EDGE_VOICES = {
  'hi-IN': 'hi-IN-SwaraNeural',
  'en-IN': 'en-IN-NeerjaNeural',
};

const SUPPORTED_LANGUAGES = Object.keys(EDGE_VOICES);
export const DEFAULT_LANGUAGE = 'hi-IN';

const SARVAM_TIMEOUT_MS = 15000;
const EDGE_TIMEOUT_MS = 15000;

/**
 * Cache of synthesized audio keyed by language + exact question text
 * (PRD §7a.1: don't regenerate identical audio for repeated questions like
 * the opening "what brings you in today?").
 *
 * In-memory and per-process on purpose: this is a warm cache for the
 * handful of fixed questions the dialogue engine reuses across sessions,
 * not a persistence layer. A Render restart or a second instance just
 * means a few extra Sarvam calls, never a wrong answer.
 *
 * Bounded so a long tail of unique AI-generated follow-up questions (which
 * are effectively never repeated) can't grow this without limit. Insertion
 * order + delete-oldest gives simple FIFO eviction; the fixed opening
 * questions are re-added on their next hit if they ever get evicted.
 */
const audioCache = new Map();
const CACHE_MAX_ENTRIES = 200;

function cacheKey(text, language) {
  return `${language}::${text}`;
}

function readCache(text, language) {
  return audioCache.get(cacheKey(text, language)) || null;
}

function writeCache(text, language, entry) {
  if (audioCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = audioCache.keys().next().value;
    if (oldest !== undefined) audioCache.delete(oldest);
  }
  audioCache.set(cacheKey(text, language), entry);
}

/** Test seam — lets a test start from a known-cold cache. */
export function __clearTtsCache() {
  audioCache.clear();
}

// Spoken framing for a turn's quick_reply_options, so a patient who is
// listening rather than reading knows what they can choose from (the
// options are otherwise invisible to them). Phrasing confirmed with the
// user — natural clinic speech rather than a literal translation of
// "the options are", which reads like a form being dictated.
const OPTION_INTRO = {
  'hi-IN': 'आप कह सकते हैं:',
  'en-IN': 'You can say:',
};

// Joins the last two options with "or" so the list ends the way a person
// would say it, not as a flat comma run.
const OPTION_LAST_JOINER = {
  'hi-IN': 'या',
  'en-IN': 'or',
};

/**
 * Builds the sentence read after a question's own audio. Returns '' when
 * there is nothing worth reading — a free-text question with no options
 * gets no readout at all (PRD: option readout only where options exist).
 */
export function buildOptionsSpeech(options, language) {
  const list = Array.isArray(options) ? options.map((o) => String(o).trim()).filter(Boolean) : [];
  if (list.length === 0) return '';

  const lang = normalizeLanguage(language);
  const intro = OPTION_INTRO[lang];

  if (list.length === 1) return `${intro} ${list[0]}`;

  const joiner = OPTION_LAST_JOINER[lang];
  const head = list.slice(0, -1).join(', ');
  return `${intro} ${head}, ${joiner} ${list[list.length - 1]}`;
}

export function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

/**
 * Classify a Sarvam failure so the caller's logs say WHY the fallback
 * kicked in. Mirrors aiClient.js's classify() taxonomy, adapted to
 * Sarvam's error shape.
 *
 * Sarvam returns 403 for BOTH a missing/invalid key AND an authenticated-
 * but-forbidden request, so status alone can't tell a dead key from a
 * permission problem — the body's error.code disambiguates
 * (invalid_api_key_error vs anything else). Treating every 403 as
 * KEY_DEAD would wrongly mark a live key dead for the rest of the process.
 */
function classifySarvam(status, bodyText) {
  const body = (bodyText || '').toLowerCase();
  if (status === 429) return 'RATE_LIMIT';
  if (status === 403) {
    return body.includes('invalid_api_key_error') ? 'KEY_DEAD' : 'FORBIDDEN';
  }
  if (status === 401) return 'KEY_DEAD';
  if (status === 402 || body.includes('insufficient') || body.includes('quota')) return 'QUOTA_EXHAUSTED';
  if (status === 0) return 'NETWORK';
  if (status >= 500) return 'PROVIDER_ERROR';
  return 'BAD_REQUEST';
}

// Failures that mean "this key is finished" — retire it and move to the
// next one in the pool. Everything else (5xx, timeout, network) says
// nothing about the key's validity and must not burn it.
const KEY_EXHAUSTED_CODES = new Set(['KEY_DEAD', 'QUOTA_EXHAUSTED', 'RATE_LIMIT']);

/** Test seam — restores the whole key pool. */
export function __resetSarvamKeyState() {
  __resetKeyPool();
}

/**
 * One Sarvam attempt with one specific key. The caller owns retry/rotation
 * so the key-pool logic lives in exactly one place.
 */
async function attemptSarvam(text, language, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SARVAM_TIMEOUT_MS);

  let status = 0;
  let bodyText = '';
  try {
    const res = await fetch(SARVAM_TTS_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.slice(0, SARVAM_MAX_CHARS),
        target_language_code: language,
        speaker: SARVAM_SPEAKER,
        model: SARVAM_MODEL,
        pace: SARVAM_PACE,
        speech_sample_rate: SARVAM_SAMPLE_RATE,
      }),
      signal: controller.signal,
    });

    status = res.status;
    bodyText = await res.text();

    if (!res.ok) {
      return { ok: false, error_code: classifySarvam(status, bodyText), status };
    }

    // Sarvam returns { audios: [ "<base64 wav>" ] }.
    const parsed = JSON.parse(bodyText);
    const audioBase64 = Array.isArray(parsed.audios) ? parsed.audios[0] : null;
    if (!audioBase64) return { ok: false, error_code: 'NO_AUDIO', status };

    return {
      ok: true,
      audio_base64: audioBase64,
      mime_type: 'audio/wav',
      provider: 'sarvam',
      voice: SARVAM_SPEAKER,
    };
  } catch (err) {
    const code = err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    return { ok: false, error_code: code };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sarvam with key rotation: walks the pool until one key succeeds or all
 * are spent. A key that reports exhausted/invalid is retired permanently
 * (an exhausted free-tier key does not come back), so the cost of a spent
 * key is one failed request, once — not one per question thereafter.
 */
async function synthesizeWithSarvam(text, language) {
  let lastError = 'NO_KEY';

  // Bounded by the pool size: every iteration either returns or retires a
  // key, so this cannot spin.
  for (;;) {
    const active = currentKey();
    if (!active) return { ok: false, error_code: lastError === 'NO_KEY' ? 'NO_KEY' : `ALL_KEYS_SPENT (${lastError})` };

    const result = await attemptSarvam(text, language, active.key);
    if (result.ok) return result;

    lastError = result.error_code;

    if (KEY_EXHAUSTED_CODES.has(result.error_code)) {
      // Retire and immediately try the next key on this same request, so a
      // patient never sees a failed question just because a key ran out
      // mid-session.
      retireKey(active.index, result.error_code);
      continue;
    }

    // Transient (5xx / timeout / network) — the key is fine, the request
    // isn't. Fall through to edge-tts rather than burning the pool.
    return result;
  }
}

async function synthesizeWithEdge(text, language) {
  try {
    const voice = EDGE_VOICES[language] || EDGE_VOICES[DEFAULT_LANGUAGE];
    const tts = new EdgeTTS(text, voice);

    // edge-tts talks over a WebSocket with no timeout of its own — without
    // this race a hung socket would stall the intake turn indefinitely,
    // which is exactly the "voice never blocks the session" failure the
    // fallback exists to prevent.
    const result = await Promise.race([
      tts.synthesize(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('edge-tts timeout')), EDGE_TIMEOUT_MS)
      ),
    ]);

    const buffer = Buffer.from(await result.audio.arrayBuffer());
    if (buffer.length === 0) return { ok: false, error_code: 'NO_AUDIO' };

    return {
      ok: true,
      audio_base64: buffer.toString('base64'),
      mime_type: 'audio/mpeg',
      provider: 'edge-tts',
      voice,
    };
  } catch (err) {
    return { ok: false, error_code: 'EDGE_FAILED', detail: err.message };
  }
}

/**
 * Synthesize one question to speech. Never throws — a total failure
 * returns { ok: false } and the caller simply omits audio from the turn
 * response, leaving the text/tap flow fully intact (PRD §3: voice failures
 * degrade gracefully, and text is never removed as an option).
 *
 * @param {string} text - the question to speak (next_question).
 * @param {string} language - 'hi-IN' | 'en-IN'; anything else falls back
 *   to the default rather than erroring.
 * @returns {Promise<{ ok: boolean, audio_base64?: string,
 *   mime_type?: string, provider?: string, voice?: string,
 *   cached?: boolean, error_code?: string }>}
 */
export async function synthesizeSpeech(text, language = DEFAULT_LANGUAGE) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error_code: 'EMPTY_TEXT' };
  }

  const cleanText = text.trim();
  const lang = normalizeLanguage(language);

  const cached = readCache(cleanText, lang);
  if (cached) return { ...cached, cached: true };

  const sarvam = await synthesizeWithSarvam(cleanText, lang);
  if (sarvam.ok) {
    writeCache(cleanText, lang, sarvam);
    return { ...sarvam, cached: false };
  }

  // Fall through to edge-tts on ANY Sarvam failure — dead key, exhausted
  // quota, rate limit, timeout, 5xx. A lesser voice beats a silent turn.
  console.warn(`[tts] sarvam failed (${sarvam.error_code}), falling back to edge-tts`);

  const edge = await synthesizeWithEdge(cleanText, lang);
  if (edge.ok) {
    writeCache(cleanText, lang, edge);
    return { ...edge, cached: false, degraded: true };
  }

  console.error(`[tts] all providers failed: sarvam=${sarvam.error_code} edge=${edge.error_code}`);
  return { ok: false, error_code: `TTS_UNAVAILABLE (${sarvam.error_code}/${edge.error_code})` };
}

export default { synthesizeSpeech, normalizeLanguage, DEFAULT_LANGUAGE };
