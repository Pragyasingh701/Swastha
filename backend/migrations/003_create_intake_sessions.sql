-- Migration: create intake_sessions table (Module A, Phase 1).
--
-- Deviates from the PRD's literal DDL (PRD §7) in one respect: the PRD's
-- `patient_id uuid references users(id)` assumes a shared `users` table.
-- That table was dropped in M7 (supabase/migrations/20260819180323_drop_
-- users_table_and_dead_columns.sql) — the real schema has separate
-- `patients` / `doctors` tables with `character varying` primary keys
-- (e.g. "usr_..."), and every other table with a patient/doctor reference
-- (reports, vault_table, family_members, doctor_patient — see
-- supabase/migrations/20260819175712_rename_user_id_add_foreign_keys.sql)
-- follows that same character varying + FK-to-patients/doctors pattern.
-- intake_sessions matches it here instead of the PRD's uuid/users(id) shape.
-- Confirmed with the user before writing this.
--
-- `id` stays a uuid PK (own generated identity, per PRD §7) — only the
-- patient_id/doctor_id reference columns change type.

create table if not exists public.intake_sessions (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         character varying not null references public.patients(id) on delete cascade,
  doctor_id          character varying references public.doctors(id) on delete set null,
  status             text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  chief_complaint    text,
  structured_history jsonb not null default '{}'::jsonb,
  turns              jsonb not null default '[]'::jsonb,
  priority           text not null default 'routine' check (priority in ('routine', 'flagged')),
  red_flag_reason    text,
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);

-- Patient-facing lookups ("my sessions") and the doctor queue's two sort keys.
create index if not exists idx_intake_sessions_patient on public.intake_sessions(patient_id);
create index if not exists idx_intake_sessions_priority_created on public.intake_sessions(priority, created_at);

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop table if exists public.intake_sessions;
-- ═══════════════════════════════════════════════════════════════════════
