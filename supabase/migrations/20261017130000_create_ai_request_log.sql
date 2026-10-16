-- ai_request_log — one row per request sent to a third-party AI provider,
-- recording WHICH provider and model handled it, so "where did this
-- patient's data go?" has an answer.
--
-- Deliberately stores no content (no prompt, document or answer text): only
-- who asked (user_id), the route, the kind of work (generation, vision-ocr,
-- embedding, tts, asr), the provider/model that answered ('gemini',
-- 'openrouter', 'sarvam', 'edge-tts', or 'none' when every provider failed),
-- whether that was a fallback rather than the primary provider, and the
-- outcome. Written best-effort by backend/rag/utils/aiRequestLog.js — the app
-- works before this migration is applied (it then logs to stdout only).
--
-- No FK on user_id: like ask_swastha_access_log, the log should outlive the
-- account it describes. RLS is on with no policies, so only the service-role
-- key (the backend) can read or write it.

begin;

create table if not exists public.ai_request_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     character varying,
  route       text,
  kind        text not null,
  provider    text not null,
  model       text,
  ok          boolean not null,
  degraded    boolean not null default false,
  fallback    boolean not null default false,
  latency_ms  integer,
  error_code  text
);

alter table public.ai_request_log enable row level security;

create index if not exists ai_request_log_created_at_idx on public.ai_request_log (created_at);
create index if not exists ai_request_log_user_created_idx on public.ai_request_log (user_id, created_at);
-- "which requests went to a fallback provider?" is the question this table
-- most needs to answer quickly.
create index if not exists ai_request_log_fallback_idx on public.ai_request_log (created_at) where fallback;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop table if exists public.ai_request_log;
-- ═══════════════════════════════════════════════════════════════════════
