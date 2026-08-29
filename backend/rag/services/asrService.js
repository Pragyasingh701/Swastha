// Module A — Voice Layer (Phase 7b): speech-to-text for patient answers.
//
// Sibling of ttsService.js and deliberately shaped the same way: its own
// lightweight classified-failure logic rather than aiClient.js's model
// ladder (that ladder is for LLM text completions and maps onto nothing
// here), and it never throws — a failed transcription returns
// { ok: false } so the caller can tell the patient to try again or type
// instead. Voice failing must never block an intake (PRD §3).
//
// Unlike TTS there is NO second provider to fall back to: edge-tts is
// output-only, and no free in-process ASR exists that handles Hinglish.
// The fallback for a failed transcription is therefore the text field
// itself, which §6 keeps permanently visible for exactly this reason.
//
// Single-blob upload, not streaming (PRD §8.1, §10 — WebSocket streaming
// on Render is unproven and explicitly deferred). Tap to record, tap to
// stop, one POST, one transcript back.
import { Buffer } from 'node:buffer';
import { currentKey, retireKey, __resetKeyPool } from '../config/sarvamKeys.js';

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';

const SARVAM_MODEL = 'saaras:v3';

// Compared against the live API on real Hindi / English / Hinglish audio.
// For "kal se fever hai, aur body pain bhi":
//   default   -> काल से फीवर है और बॉडी पेन भी।   (English transliterated
//                into Devanagari — "फीवर", "बॉडी पेन")
//   codemix   -> काल से fever है और body pain भी   (English kept as English)
// codemix is what a patient would actually write, and leaves clinical
// terms ("fever", "body pain") readable to a doctor scanning the record
// later rather than buried in Devanagari transliteration. Verified not to
// harm the non-mixed cases: pure English is untouched, pure Hindi stays
// correct. Hinglish handling is the stated reason this phase exists
// (PRD §3), so it gets the mode that handles it best.
const SARVAM_MODE = 'codemix';

// Sarvam accepts wav/mp3/webm/ogg/opus/flac/m4a/aac and more. MediaRecorder
// in Chrome/Edge produces audio/webm;codecs=opus and Safari produces
// audio/mp4 — both are on that list, so the browser's native output is
// sent through as-is rather than transcoded server-side.
const ALLOWED_AUDIO_MIME = [
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'audio/opus',
];

const STT_TIMEOUT_MS = 30000;

// An intake answer is a sentence or two. A blob far larger than a plausible
// answer means a stuck recorder, not a talkative patient — reject it before
// spending API credit (PRD §9: the Sarvam credit is a shared STT+TTS pool).
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB, matches routes/extract.js

/**
 * Same taxonomy as ttsService.js's classifySarvam. Kept as its own copy
 * rather than shared: the two services are independently swappable
 * (a future ASR provider change shouldn't have to reason about TTS), and
 * duplicating ~12 lines is cheaper than a shared abstraction that couples
 * them. Same reasoning aiClient.js documents for being vendored twice.
 *
 * Sarvam answers 403 for BOTH a bad key and an authenticated-but-forbidden
 * request, so the body's error.code is what separates them — a plain 403
 * must not latch the key as dead.
 */
function classifySarvam(status, bodyText) {
  const body = (bodyText || '').toLowerCase();
  if (status === 429) return 'RATE_LIMIT';
  if (status === 403) {
    return body.includes('invalid_api_key_error') ? 'KEY_DEAD' : 'FORBIDDEN';
  }
  if (status === 401) return 'KEY_DEAD';
  if (status === 402 || body.includes('insufficient') || body.includes('quota')) return 'QUOTA_EXHAUSTED';
  if (status === 413) return 'AUDIO_TOO_LARGE';
  if (status === 0) return 'NETWORK';
  if (status >= 500) return 'PROVIDER_ERROR';
  return 'BAD_REQUEST';
}

// Failures meaning "this key is finished" — retire it and move on. Shared
// definition with ttsService; anything else leaves the key in the pool.
const KEY_EXHAUSTED_CODES = new Set(['KEY_DEAD', 'QUOTA_EXHAUSTED', 'RATE_LIMIT']);

/** Test seam — restores the whole key pool. */
export function __resetSarvamKeyState() {
  __resetKeyPool();
}

export function isSupportedAudioMime(mimetype) {
  if (!mimetype) return false;
  // MediaRecorder reports codecs inline, e.g. 'audio/webm;codecs=opus'.
  const base = String(mimetype).split(';')[0].trim().toLowerCase();
  return ALLOWED_AUDIO_MIME.includes(base);
}

/**
 * Transcribe one recorded answer.
 *
 * Never throws. Sarvam returns NO confidence score — verified against the
 * live API, whose 200 body is exactly
 * { request_id, transcript, language_code } (plus timestamps only when
 * asked, and language_probability only when auto-detecting). So no
 * confidence field is surfaced here rather than inventing one. The
 * confirmation step PRD §8.1 requires is the editable text field on the
 * frontend, which applies to every transcript rather than only those under
 * some threshold — strictly safer for a clinical record.
 *
 * @param {Buffer} audioBuffer - the recorded blob, as uploaded.
 * @param {string} mimetype - the browser-reported MIME type.
 * @param {string} language - 'hi-IN' | 'en-IN', from the session row.
 * @returns {Promise<{ ok: boolean, transcript?: string,
 *   language_code?: string, error_code?: string }>}
 */
export async function transcribeSpeech(audioBuffer, mimetype, language) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    return { ok: false, error_code: 'EMPTY_AUDIO' };
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return { ok: false, error_code: 'AUDIO_TOO_LARGE' };
  }

  let lastError = 'NO_KEY';

  // Same rotation as ttsService, over the same shared pool — a key
  // exhausted while speaking a question is already retired by the time the
  // patient answers it, so ASR never re-tries a spent key.
  for (;;) {
    const active = currentKey();
    if (!active) {
      return { ok: false, error_code: lastError === 'NO_KEY' ? 'NO_KEY' : `ALL_KEYS_SPENT (${lastError})` };
    }

    const result = await attemptTranscribe(audioBuffer, mimetype, language, active.key);
    if (result.ok) return result;

    lastError = result.error_code;

    if (KEY_EXHAUSTED_CODES.has(result.error_code)) {
      retireKey(active.index, result.error_code);
      continue;
    }

    // Transient, or a real "no speech" result — either way, not the key's
    // fault. Return it rather than burning the pool.
    return result;
  }
}

/** One transcription attempt with one specific key. */
async function attemptTranscribe(audioBuffer, mimetype, language, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  try {
    const form = new FormData();
    const safeMime = isSupportedAudioMime(mimetype) ? String(mimetype).split(';')[0] : 'audio/webm';
    form.append('file', new Blob([audioBuffer], { type: safeMime }), 'answer');
    form.append('model', SARVAM_MODEL);
    form.append('mode', SARVAM_MODE);
    // Explicit language from the session row rather than 'unknown'
    // auto-detect: the language was already chosen once at /intake/start
    // (PRD §6), and telling Saaras which language to expect is more
    // reliable than making it guess from a two-second answer like "haan".
    form.append('language_code', language);

    const res = await fetch(SARVAM_STT_URL, {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey },
      body: form,
      signal: controller.signal,
    });

    const bodyText = await res.text();

    if (!res.ok) {
      const code = classifySarvam(res.status, bodyText);
      console.warn(`[asr] sarvam stt failed (${code}, HTTP ${res.status})`);
      return { ok: false, error_code: code };
    }

    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return { ok: false, error_code: 'BAD_RESPONSE' };
    }

    const transcript = typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '';

    // A successful call that heard nothing (silence, mic muted at the OS
    // level, patient tapped stop immediately). Distinct from a failure so
    // the frontend can say "didn't catch that" rather than "something went
    // wrong" — and in both cases it leaves the text field alone.
    if (!transcript) return { ok: false, error_code: 'NO_SPEECH_DETECTED' };

    return {
      ok: true,
      transcript,
      language_code: parsed.language_code || language,
    };
  } catch (err) {
    const code = err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
    console.warn(`[asr] sarvam stt failed (${code})`);
    return { ok: false, error_code: code };
  } finally {
    clearTimeout(timer);
  }
}

export default { transcribeSpeech, isSupportedAudioMime };
