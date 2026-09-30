// Centralized env loading + validation. Fail loudly at startup rather than
// deep inside a request when a credential turns out to be missing —
// this is healthcare data, silent misconfiguration is not acceptable.
import dotenv from 'dotenv';

dotenv.config();

// Fallback gate: OpenRouter is a third-party model provider outside
// Google's Gemini terms, used only as a last resort once every configured
// Gemini key/model is exhausted — every generation/vision-ocr call in this
// service carries real patient/report text or document images (there is no
// patient-data-free call site left to special-case; see aiClient.js's
// runAI for where this is enforced). Defaults to true: the AI-processing
// notice every user acknowledges before first use (see
// backend/rag/config/aiNotices.js) discloses "an AI service" generically
// rather than naming Gemini specifically, so that consent already covers
// this fallback — availability (a real answer via OpenRouter beats a
// degraded "please try again" when Gemini is down) wins over restricting
// to a single named vendor. Set ALLOW_OPENROUTER_FALLBACK=false to disable
// it again. Any string other than exactly "false" (case-insensitive) is
// treated as true — an unset or typo'd value fails toward availability.
// Computed here, before the required-vars check below, since
// OPENROUTER_API_KEY's requiredness depends on it.
export const ALLOW_OPENROUTER_FALLBACK = String(process.env.ALLOW_OPENROUTER_FALLBACK ?? 'true').toLowerCase() !== 'false';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
];

// OPENROUTER_API_KEY is only required when the provider-safety flag opts
// into using it at all — with the flag false (the default), runAI's
// OpenRouter branch never runs, so requiring a key for a provider that can
// never be called would fail startup for no reason.
if (ALLOW_OPENROUTER_FALLBACK) {
  required.push('OPENROUTER_API_KEY');
}

const missing = required.filter((key) => !process.env[key]);

// GEMINI_API_KEYS (plural, comma-separated) or GEMINI_API_KEY (singular) —
// at least one form is required, checked separately since either satisfies it.
if (!process.env.GEMINI_API_KEYS && !process.env.GEMINI_API_KEY) {
  missing.push('GEMINI_API_KEYS (or GEMINI_API_KEY)');
}

if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `[FATAL] Missing required environment variables: ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill these in before starting the service.'
  );
  process.exit(1);
}

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Ordered list of Gemini API keys to try, in order, on rate-limit (429).
// GEMINI_API_KEYS (comma-separated) takes priority; falls back to the
// single GEMINI_API_KEY for backward compatibility.
export const GEMINI_API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);
// Kept for anything still importing the singular name directly.
export const GEMINI_API_KEY = GEMINI_API_KEYS[0];
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// (ALLOW_OPENROUTER_FALLBACK is exported above, before the required-vars
// check, since OPENROUTER_API_KEY's requiredness depends on it.)
// Same fallback-gate reasoning as ALLOW_OPENROUTER_FALLBACK above, for the
// voice-intake TTS path: edge-tts-universal (ttsService.js's Sarvam
// fallback) sends the assistant's generated question text — built from the
// patient's intake context — to Microsoft's speech.platform.bing.com over a
// WebSocket, outside Sarvam's terms. Defaults to true, same reasoning as
// above (the acknowledged notice already covers "an AI service" generically,
// and a spoken question beats a silent turn when Sarvam TTS fails). Set
// ALLOW_EDGE_TTS_FALLBACK=false to disable it again; any value other than
// exactly "false" (case-insensitive, same rule as the flag above) is
// treated as true. When false, ttsService.js's Sarvam fallback returns its
// existing ok:false/no-audio result instead of trying edge-tts — see
// ttsService.js's synthesizeWithEdge for the enforcement.
export const ALLOW_EDGE_TTS_FALLBACK = String(process.env.ALLOW_EDGE_TTS_FALLBACK ?? 'true').toLowerCase() !== 'false';
export const JWT_SECRET = process.env.JWT_SECRET;
export const PORT = process.env.PORT || 3010;
export const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Below this many total characters of embeddable chunk text, a patient's
// whole history is small enough to hand to the generation model directly —
// skip embedding + vector search entirely and just load every chunk. See
// conversationalSearchService.js's tryFullContextAnswer for the full
// reasoning (avoids similarity-threshold misses / top-K truncation for a
// patient with only a handful of short reports).
export const FULL_CONTEXT_MAX_CHARS = Number(process.env.FULL_CONTEXT_MAX_CHARS) || 100_000;

// How long a row in ask_swastha_access_log (see backend/db/askSwasthaAccessLog.js)
// is kept before scripts/purge-audit-log.js deletes it. Not enforced
// automatically — the purge script is meant to be run on a schedule
// (e.g. a daily cron) outside this process.
export const AUDIT_LOG_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS) || 365;

