-- Migration: doctor-side intake queue actions (Complete / Remove) + history.
--
-- `intake_sessions.status` already means "the PATIENT finished answering
-- the intake questions" (in_progress -> completed, set by the patient's own
-- chat flow via finalizeIntakeSession — see backend/rag/services/
-- intakeService.js). The doctor-facing "Completed"/"Remove" queue actions
-- mean something different (doctor has seen/consulted this patient, or
-- doctor dismissed this row from the queue) — kept as a separate column
-- rather than overloading `status`, since intakeService.js already branches
-- behavior on status === 'completed' (blocks further dialogue turns) and
-- that must stay solely a patient-driven signal.
--
-- Byte-identical copy of supabase/migrations/<timestamp>_intake_queue_
-- doctor_actions.sql (same dual-copy convention as every other migration
-- pair in this repo).

begin;

alter table public.intake_sessions
  add column doctor_action text check (doctor_action in ('completed', 'removed'));

-- Doctor queue's default view filters to doctor_action IS NULL — index
-- supports that filter combined with the existing priority/created_at sort.
create index idx_intake_sessions_doctor_action on public.intake_sessions(doctor_action);

-- Audit trail: every doctor action (Complete / Remove) on a queue row,
-- who did it and when. Append-only — a session's doctor_action column
-- holds the CURRENT state, this table holds the full history (so a
-- session that's, say, un-removed and re-removed later — see caveat below
-- — has both events preserved). doctor_id/patient_id are denormalized onto
-- the row (not just session_id) so history queries don't need a join back
-- through intake_sessions for a session a doctor might no longer be linked
-- to by the time they view history.
create table public.intake_session_actions (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.intake_sessions(id) on delete cascade,
  doctor_id   character varying not null references public.doctors(id) on delete cascade,
  patient_id  character varying not null references public.patients(id) on delete cascade,
  action      text not null check (action in ('completed', 'removed')),
  acted_at    timestamptz not null default now()
);

create index idx_intake_session_actions_doctor on public.intake_session_actions(doctor_id, acted_at);
create index idx_intake_session_actions_session on public.intake_session_actions(session_id);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop table if exists public.intake_session_actions;
--   drop index if exists idx_intake_sessions_doctor_action;
--   alter table public.intake_sessions drop column doctor_action;
-- ═══════════════════════════════════════════════════════════════════════
