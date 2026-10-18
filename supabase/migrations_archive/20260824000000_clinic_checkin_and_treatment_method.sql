-- Migration: clinic check-in flow + treatment-method-aware AI intake
-- (PRD "Swasthya — Clinic Check-In & Treatment-Method-Aware AI Intake", v1.0).
--
-- Byte-identical copy of backend/migrations/004_clinic_checkin_and_
-- treatment_method.sql (same dual-copy convention as 003_create_intake_
-- sessions.sql / supabase/migrations/20260823073754_create_intake_sessions.sql
-- — backend/migrations/ is the app-facing copy referenced in code comments,
-- supabase/migrations/ is what `supabase db push` actually applies).

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. clinic_checkin_codes — own table, not a column on doctors (PRD §3.2):
--    a code rotates daily and needs an audit trail, it's history, not
--    doctor state. Lazily generated: first request for a given
--    doctor+day creates the row if absent (see backend/db/clinicCheckin.js).
-- ═══════════════════════════════════════════════════════════════════════
create table public.clinic_checkin_codes (
  id          uuid primary key default gen_random_uuid(),
  doctor_id   character varying not null references public.doctors(id) on delete cascade,
  code        text not null,
  valid_date  date not null,
  created_at  timestamptz not null default now(),
  unique (doctor_id, valid_date),
  unique (code, valid_date)
);

-- POST /api/clinic/verify-code looks up by (code, valid_date) — the exact
-- pair the second UNIQUE constraint above already covers, but an explicit
-- index documents the hot lookup path independent of constraint internals.
create index idx_clinic_checkin_codes_code_date on public.clinic_checkin_codes(code, valid_date);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. intake_sessions — additive columns (PRD §3.2).
--    origin: default 'remote' for backward compatibility with every
--    existing row and every existing POST /api/intake/start call.
--    intake_method: snapshotted from doctor.treatment_method at session
--    creation, NEVER re-derived on read (PRD §3.4) — nullable while
--    backfilling, then locked to NOT NULL once every row has a value.
-- ═══════════════════════════════════════════════════════════════════════
alter table public.intake_sessions
  add column origin text not null default 'remote' check (origin in ('remote', 'clinic_checkin')),
  add column intake_method text check (intake_method in ('allopathic', 'ayurvedic'));

-- Backfill existing rows before enforcing NOT NULL (PRD §3.2: "Existing rows
-- backfilled with intake_method = 'allopathic' in the migration").
update public.intake_sessions set intake_method = 'allopathic' where intake_method is null;

alter table public.intake_sessions
  alter column intake_method set not null;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. doctors.treatment_method — required at registration for NEW doctors
--    (enforced in backend/routes/auth.js's POST /api/auth/register, not at
--    the DB layer): deliberately left NULLABLE here so existing doctor rows
--    are not force-assigned a method they never declared. No self-service
--    edit path exists after registration (PRD §3.2/§4.3) — the only
--    legitimate way to change it is the audited path below, via
--    doctor_method_changes + a db-layer helper (backend/db/clinicCheckin.js
--    recordMethodChange), with no HTTP route yet since there is no
--    admin-auth model in this codebase to gate one with safely.
-- ═══════════════════════════════════════════════════════════════════════
alter table public.doctors
  add column treatment_method text check (treatment_method in ('allopathic', 'ayurvedic'));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. doctor_method_changes — audit trail for every post-registration
--    treatment_method change (PRD §3.2/§4.3). old_method is nullable to
--    cover the first-ever change for a doctor who registered before this
--    column existed (old_method NULL -> new_method).
-- ═══════════════════════════════════════════════════════════════════════
create table public.doctor_method_changes (
  id           uuid primary key default gen_random_uuid(),
  doctor_id    character varying not null references public.doctors(id) on delete cascade,
  old_method   text,
  new_method   text not null check (new_method in ('allopathic', 'ayurvedic')),
  changed_by   character varying not null,
  changed_at   timestamptz not null default now()
);

create index idx_doctor_method_changes_doctor on public.doctor_method_changes(doctor_id);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   alter table public.intake_sessions drop column origin;
--   alter table public.intake_sessions drop column intake_method;
--   alter table public.doctors drop column treatment_method;
--   drop table if exists public.doctor_method_changes;
--   drop table if exists public.clinic_checkin_codes;
-- ═══════════════════════════════════════════════════════════════════════
