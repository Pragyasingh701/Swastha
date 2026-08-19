-- M2 — Create patients / doctors / pending_registrations (Phase 3, D1 + D3)
--
-- Purely additive: creates 3 new tables + 1 view. `users` is NOT touched —
-- the app keeps running exactly as before. Nothing yet reads from or writes
-- to these tables (that's M4, the cutover, done in its own reviewed step).
--
-- Column shapes match db-schema-current.md exactly:
--   - patients:  shared cols + blood_group, patient_code (patient-only)
--   - doctors:   shared cols + specialty, license_number, council, degree,
--                experience, hospital_name, address, reg_certificate_url,
--                cert_extracted_data, license_expiry_date (doctor-only,
--                kept per decision D6 — feature intended for HPR cert flow)
--   - pending_registrations: signed up, no role chosen yet (decision D3) —
--                only the columns that make sense before a role exists
--
-- NOTE: ensure_rls (the event trigger from Phase 1) will auto-run
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on each of these the moment
-- they're created. That's expected and fine (decision D5) — the app uses
-- the service-role key, which bypasses RLS, so this changes nothing
-- observable. No policies are added; that matches every existing table's
-- current posture (RLS enabled, zero policies, deny-all to anon/authenticated).

begin;

create table public.patients (
  id                   character varying primary key,
  email                character varying not null unique,
  name                 character varying,
  picture              text,
  password_hash        character varying,
  auth_provider        character varying,
  phone                text,
  dob                  text,
  gender               text,
  blood_group          text,
  patient_code         text unique,
  verification_status  text default 'verified',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.doctors (
  id                   character varying primary key,
  email                character varying not null unique,
  name                 character varying,
  picture              text,
  password_hash        character varying,
  auth_provider        character varying,
  phone                text,
  dob                  text,
  gender               text,
  specialty            character varying,
  license_number       character varying,
  council              text,
  degree               text,
  experience           text,
  hospital_name        text,
  address              text,
  reg_certificate_url  text,
  cert_extracted_data  jsonb,
  license_expiry_date  date,
  verification_status  text default 'pending',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.pending_registrations (
  id                   character varying primary key,
  email                character varying not null unique,
  name                 character varying,
  picture              text,
  password_hash        character varying,
  auth_provider        character varying,
  verification_status  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Read-only convenience view for the login lookup path (decision D1) — NOT
-- a merge of the tables. Lets auth code check one place for
-- "does this email exist, and if so with which password_hash / role" instead
-- of querying 3 tables in sequence. All 3 source tables are still
-- independent; this is purely a UNION for reads.
create view public.auth_identities as
  select id, email, password_hash, auth_provider, 'patient'::text as role
  from public.patients
  union all
  select id, email, password_hash, auth_provider, 'doctor'::text as role
  from public.doctors
  union all
  select id, email, password_hash, auth_provider, 'none'::text as role
  from public.pending_registrations;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT (safe — nothing else references these yet):
--   drop view if exists public.auth_identities;
--   drop table if exists public.patients;
--   drop table if exists public.doctors;
--   drop table if exists public.pending_registrations;
-- ═══════════════════════════════════════════════════════════════════════
