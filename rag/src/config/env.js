// Centralized env loading + validation. Fail loudly at startup rather than
// deep inside a request when a credential turns out to be missing —
// this is healthcare data, silent misconfiguration is not acceptable.
import dotenv from 'dotenv';

dotenv.config();

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY', // embeddings only — see config/gemini.js
  'OPENROUTER_API_KEY', // grounded answer generation — see config/openrouter.js
  'JWT_SECRET',
];

const missing = required.filter((key) => !process.env[key]);

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
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const JWT_SECRET = process.env.JWT_SECRET;
export const PORT = process.env.PORT || 3010;
export const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
