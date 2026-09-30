-- ask_swastha_access_log — a request-level audit trail of WHO accessed
-- WHICH patient's records via Ask Swastha (both POST /rag/api/search/chat
-- and POST /rag/api/search), for compliance/security review of
-- doctor-to-patient access in particular. Deliberately holds no question,
-- excerpt, or answer text — the goal is a record of access, not a copy of
-- the conversation (which already lives, far more richly, in
-- session memory and application logs).
--
-- Written best-effort at the end of each request (see
-- backend/db/askSwasthaAccessLog.js's logAccess) — an insert failure here
-- must never fail the underlying search request; the route only logs the
-- ids involved and moves on.
--
-- No RLS policies added — matches every other table in this project (RLS
-- is enabled by the ensure_rls event trigger, the app uses the
-- service-role key which bypasses it, and the "service role only" posture
-- this table needs is exactly what zero policies gives it).

begin;

create table if not exists public.ask_swastha_access_log (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  caller_user_id    character varying not null,
  target_patient_id character varying not null,
  is_cross_patient  boolean not null default false,
  route             text not null check (route in ('search_chat', 'search')),
  mode              text check (mode in ('full_context', 'retrieval', 'aggregate')),
  result_count      integer,
  degraded          boolean not null default false
);

alter table public.ask_swastha_access_log enable row level security;

create index if not exists ask_swastha_access_log_target_created_idx
  on public.ask_swastha_access_log (target_patient_id, created_at);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop table if exists public.ask_swastha_access_log;
-- ═══════════════════════════════════════════════════════════════════════
