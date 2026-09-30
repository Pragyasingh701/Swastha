// Centralized env loading + validation. Fail loudly at startup rather than
// deep inside a request when a credential turns out to be missing —
// this is healthcare data, silent misconfiguration is not acceptable.
import dotenv from 'dotenv';

dotenv.config();

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY', // grounded answer generation — see config/openrouter.js
  'JWT_SECRET',
];

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
// Provider-safety gate: OpenRouter is a third-party model provider outside
// Google's Gemini terms — every generation/vision-ocr call in this service
// carries real patient/report text or document images (there is no
// patient-data-free call site left to special-case; see aiClient.js's
// runAI for where this is enforced). Defaults to false, i.e. Gemini-only,
// so patient data is never sent to OpenRouter unless explicitly opted in.
// Any string other than exactly "true" (case-insensitive) is treated as
// false — an unset, empty, or typo'd value fails safe.
export const ALLOW_OPENROUTER_FALLBACK = String(process.env.ALLOW_OPENROUTER_FALLBACK || '').toLowerCase() === 'true';
// Same provider-safety reasoning as ALLOW_OPENROUTER_FALLBACK above, for the
// voice-intake TTS path: edge-tts-universal (ttsService.js's Sarvam
// fallback) sends the assistant's generated question text — built from the
// patient's intake context — to Microsoft's speech.platform.bing.com over a
// WebSocket, outside Sarvam's terms. Defaults to false; any value other
// than exactly "true" (case-insensitive, same rule as the flag above) is
// treated as false. When false, ttsService.js's Sarvam fallback returns its
// existing ok:false/no-audio result instead of trying edge-tts — see
// ttsService.js's synthesizeWithEdge for the enforcement.
export const ALLOW_EDGE_TTS_FALLBACK = String(process.env.ALLOW_EDGE_TTS_FALLBACK || '').toLowerCase() === 'true';
export const JWT_SECRET = process.env.JWT_SECRET;
export const PORT = process.env.PORT || 3010;
export const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Rate limits for the heaviest per-request AI call chains: an Ask Swastha
// chat turn (embed + vector search + generate), a report indexing call
// (embed every chunk sequentially), the one-shot search endpoint (same
// chain as chat, minus conversation memory), and vision-OCR extraction
// (the slowest single call — 45s timeout — so it gets the tightest cap).
// Defaults match what a normal doctor/patient session actually does; all
// are env-overridable without a code change if the free-tier AI quota
// needs a tighter cap.
export const SEARCH_CHAT_RATE_LIMIT_WINDOW_MS = Number(process.env.SEARCH_CHAT_RATE_LIMIT_WINDOW_MS) || 60_000;
export const SEARCH_CHAT_RATE_LIMIT_MAX = Number(process.env.SEARCH_CHAT_RATE_LIMIT_MAX) || 20;
export const REPORTS_INDEX_RATE_LIMIT_WINDOW_MS = Number(process.env.REPORTS_INDEX_RATE_LIMIT_WINDOW_MS) || 60_000;
export const REPORTS_INDEX_RATE_LIMIT_MAX = Number(process.env.REPORTS_INDEX_RATE_LIMIT_MAX) || 30;
export const SEARCH_RATE_LIMIT_WINDOW_MS = Number(process.env.SEARCH_RATE_LIMIT_WINDOW_MS) || 60_000;
export const SEARCH_RATE_LIMIT_MAX = Number(process.env.SEARCH_RATE_LIMIT_MAX) || 20;
export const EXTRACT_RATE_LIMIT_WINDOW_MS = Number(process.env.EXTRACT_RATE_LIMIT_WINDOW_MS) || 60_000;
export const EXTRACT_RATE_LIMIT_MAX = Number(process.env.EXTRACT_RATE_LIMIT_MAX) || 5;

// Below this many total characters of embeddable chunk text, a patient's
// whole history is small enough to hand to the generation model directly —
// skip embedding + vector search entirely and just load every chunk. See
// conversationalSearchService.js's tryFullContextAnswer for the full
// reasoning (avoids similarity-threshold misses / top-K truncation for a
// patient with only a handful of short reports).
export const FULL_CONTEXT_MAX_CHARS = Number(process.env.FULL_CONTEXT_MAX_CHARS) || 100_000;
