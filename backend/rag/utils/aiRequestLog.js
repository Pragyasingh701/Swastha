// Records which third-party AI provider handled each request, so "where did
// this patient's data go?" can be answered. Stores NO content — only who
// asked (user id), which route, the kind of work, the provider and model that
// answered, whether it was a fallback, and whether it worked.
//
// Always written to the server log; also inserted into ai_request_log
// (migration 20261017130000) on a best-effort basis: a failed or missing table
// never affects the request that triggered it.
import { supabase } from '../config/supabase.js';
import { getRequestContext } from './requestContext.js';

const TABLE = 'ai_request_log';

// Primary provider per kind of work; anything else is a fallback.
const PRIMARY_PROVIDER = {
  generation: 'gemini',
  'vision-ocr': 'gemini',
  embedding: 'gemini',
  tts: 'sarvam',
  asr: 'sarvam',
};

let missingTableWarned = false;

export function recordAiRequest({ kind, provider = null, model = null, ok, degraded = false, latencyMs = null, errorCode = null }) {
  try {
    const context = getRequestContext() || {};
    const usedProvider = provider || 'none';
    const fallback = Boolean(provider) && PRIMARY_PROVIDER[kind] !== undefined && provider !== PRIMARY_PROVIDER[kind];

    const line =
      `[ai-request] kind=${kind} provider=${usedProvider} model=${model || '-'} ok=${Boolean(ok)} ` +
      `fallback=${fallback} ms=${latencyMs ?? '-'} user=${context.userId || '-'} route=${context.route || '-'}` +
      (errorCode ? ` error=${errorCode}` : '');
    if (fallback || !ok) console.warn(line);
    else console.log(line);

    // Tests (node --test sets NODE_TEST_CONTEXT) must not add rows to the real
    // table; the log test opts back in with AI_REQUEST_LOG_FORCE=true.
    if (!supabase || (process.env.NODE_TEST_CONTEXT && process.env.AI_REQUEST_LOG_FORCE !== 'true')) return;
    Promise.resolve(
      supabase.from(TABLE).insert({
        user_id: context.userId || null,
        route: context.route || null,
        kind,
        provider: usedProvider,
        model,
        ok: Boolean(ok),
        degraded: Boolean(degraded),
        fallback,
        latency_ms: latencyMs,
        error_code: errorCode,
      })
    )
      .then((result) => {
        const error = result?.error;
        if (!error) return;
        // Table not created yet (migration not applied): say so once, not per request.
        if (error.code === '42P01' || error.code === 'PGRST205') {
          if (!missingTableWarned) {
            missingTableWarned = true;
            console.warn(`[ai-request] ${TABLE} table not found — provider usage is being logged to stdout only. Apply migration 20261017130000.`);
          }
          return;
        }
        console.error('[ai-request] could not store log row:', error.message);
      })
      .catch((err) => console.error('[ai-request] could not store log row:', err?.message || err));
  } catch (err) {
    console.error('[ai-request] logging failed:', err?.message || err);
  }
}
