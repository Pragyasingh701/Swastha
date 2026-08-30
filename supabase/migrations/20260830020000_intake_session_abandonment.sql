-- Migration: abandoned-session expiry for intake_sessions (Module A audit
-- fix, Issue #10).
--
-- Audit finding: no cleanup/expiry mechanism existed for an intake session
-- left in_progress and never returned to. Live inspection found 70 of 104
-- sampled sessions stuck in_progress, most well over 24h old — largely
-- explained by Issue #4 (no resume path existed before this same fix pass)
-- and, for a smaller subset, Issue #2/#3 (a state-machine stall). Those two
-- are now fixed elsewhere; this migration adds the expiry mechanism itself
-- so an abandoned session (patient genuinely walked away — device closed,
-- lost interest, etc., as opposed to a resumable refresh, which now works)
-- stops cluttering the doctor's Active Queue and the patient's own
-- "resume this" state after a bounded window.
--
-- Decision (confirmed with the user): mark as a new 'abandoned' status
-- rather than deleting or silently time-filtering — the partial clinical
-- data a patient did provide before abandoning is still worth keeping, an
-- abandoned session can still show up in History, and a patient who
-- returns later (GET /rag/api/intake/:sessionId resume, Issue #4) un-
-- abandons it back to 'in_progress' rather than losing their progress
-- outright. The sweep threshold (48h) is longer than the existing 24h
-- doctor-patient access-link expiry pattern in db/doctorPatients.js,
-- deliberately: a patient pausing a multi-part intake over a weekend is a
-- legitimate use, not abandonment, and this is advisory queue hygiene, not
-- a security boundary the way the access-link expiry is.
--
-- abandoned_at is separate from completed_at (which stays exclusively
-- "the patient finished the intake") — an abandoned session was NOT
-- completed, and conflating the two columns would make finishedness
-- ambiguous everywhere both are already read (e.g.
-- getIntakeActionHistoryForDoctor, the Visit Intake Summary modal).
--
-- Byte-identical copy of supabase/migrations/20260830020000_intake_
-- session_abandonment.sql (same dual-copy convention as every other
-- migration pair in this repo).

begin;

-- Drops whatever the status check constraint is actually named, rather than
-- assuming Postgres's default 'intake_sessions_status_check' — it matches
-- the auto-generated name for the original inline `check` in 003's create
-- table (no explicit constraint name was given there), but a DO block that
-- looks it up directly is one less thing that can silently no-op if that
-- assumption is ever wrong on a given environment.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.intake_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%in_progress%'
  loop
    execute format('alter table public.intake_sessions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.intake_sessions
  add constraint intake_sessions_status_check
    check (status in ('in_progress', 'completed', 'abandoned'));

alter table public.intake_sessions
  add column abandoned_at timestamptz;

-- Sweep query: `where status = 'in_progress' and created_at < now() - interval '48 hours'`
-- (see backend/scripts/expireAbandonedIntakeSessions.js) — this index
-- supports that filter the same way idx_intake_sessions_doctor_action
-- supports the active-queue filter in 005.
create index idx_intake_sessions_status_created on public.intake_sessions(status, created_at);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop index if exists idx_intake_sessions_status_created;
--   alter table public.intake_sessions drop column abandoned_at;
--   alter table public.intake_sessions drop constraint intake_sessions_status_check;
--   alter table public.intake_sessions
--     add constraint intake_sessions_status_check
--       check (status in ('in_progress', 'completed'));
-- ═══════════════════════════════════════════════════════════════════════
