-- ask_swastha_feedback — thumbs up/down on an Ask Swastha answer bubble
-- (DoctorAskSwastha.jsx). Records who rated an answer and a few shape
-- fields about it (mode, which reports it cited, whether it was a degraded
-- fallback) — never the question or answer text itself, so this table
-- can't become a second copy of patient-record content.
--
-- No RLS policies added — matches every other table in this project (RLS
-- is enabled by the ensure_rls event trigger, the app uses the
-- service-role key which bypasses it, and the "service role only" posture
-- this table needs is exactly what zero policies gives it).

begin;

create table if not exists public.ask_swastha_feedback (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  user_id           character varying not null,
  rating            text not null check (rating in ('up', 'down')),
  mode              text check (mode in ('full_context', 'retrieval', 'aggregate')),
  source_report_ids text[] not null default '{}',
  degraded          boolean not null default false
);

alter table public.ask_swastha_feedback enable row level security;

create index if not exists ask_swastha_feedback_user_created_idx
  on public.ask_swastha_feedback (user_id, created_at);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop table if exists public.ask_swastha_feedback;
-- ═══════════════════════════════════════════════════════════════════════
