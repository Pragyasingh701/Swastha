-- ai_notice_acknowledgements — one-time, per-user, per-feature record that
-- the AI-processing disclosure for a given feature (Ask Swastha, voice
-- intake) has been shown and explicitly accepted. Enforced server-side on
-- POST /rag/api/search/chat and POST /rag/api/intake/start (see
-- backend/rag/middleware/requireNoticeAck.js) — never trusted from the UI
-- alone.
--
-- notice_version lets the wording be revised later and re-prompt everyone:
-- a row only counts as a valid acknowledgement for the version it was
-- recorded against (see requireNoticeAck.js's exact-match check), so
-- bumping backend/rag/config/aiNotices.js's version constant makes every
-- existing row stale without deleting anything.
--
-- Deliberately NO free-text/consent-wording column — just enough to prove
-- "user X accepted version Y of feature Z's notice at time T." Legal/consent
-- copy itself lives in code (backend/rag/config/aiNotices.js), not the DB,
-- so it can be reviewed/edited without a migration.
--
-- No RLS policies added — matches every other table in this project (RLS is
-- enabled by the ensure_rls event trigger, the app uses the service-role
-- key which bypasses it, and authorization is enforced in application code,
-- not in Postgres policies).

begin;

create table if not exists public.ai_notice_acknowledgements (
  id             bigint generated always as identity primary key,
  user_id        character varying not null,
  feature        text not null check (feature in ('ask_swastha', 'voice_intake')),
  notice_version integer not null,
  created_at     timestamptz not null default now(),
  unique (user_id, feature, notice_version)
);

alter table public.ai_notice_acknowledgements enable row level security;

create index if not exists ai_notice_acknowledgements_user_feature_idx
  on public.ai_notice_acknowledgements (user_id, feature);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop table if exists public.ai_notice_acknowledgements;
-- ═══════════════════════════════════════════════════════════════════════
