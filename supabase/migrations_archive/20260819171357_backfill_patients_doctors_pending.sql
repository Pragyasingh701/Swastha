-- M3 — Backfill patients / doctors / pending_registrations from users
-- (Phase 3, D2/D3 applied)
--
-- Copies the 9 existing `users` rows into their split-table homes based on
-- `role`. `users` is NOT modified or deleted here — it remains the live
-- source of truth for the app until M4 (the code cutover) is reviewed and
-- applied separately. This step is purely additive and fully re-runnable
-- (each insert is idempotent via ON CONFLICT DO NOTHING, so running this
-- twice is a no-op rather than a duplicate-key error).
--
-- Role split verified in db-code-crossref.md: patient=4, doctor=4, none/null=1
-- (9 total, none lost).
--
-- decision D4: doctor's stray `patient_code` (singhpragya701@gmail.com) is
-- dropped naturally — `patient_code` only exists on the `patients` table,
-- and this user's role='doctor' row goes to `doctors`, which has no such
-- column.

begin;

insert into public.patients
  (id, email, name, picture, password_hash, auth_provider, phone, dob, gender,
   blood_group, patient_code, verification_status, created_at, updated_at)
select
  id, email, name, picture, password_hash, auth_provider, phone, dob, gender,
  blood_group, patient_code,
  coalesce(verification_status, 'verified'),
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from public.users
where role = 'patient'
on conflict (id) do nothing;

insert into public.doctors
  (id, email, name, picture, password_hash, auth_provider, phone, dob, gender,
   specialty, license_number, council, degree, experience, hospital_name,
   address, reg_certificate_url, cert_extracted_data, license_expiry_date,
   verification_status, created_at, updated_at)
select
  id, email, name, picture, password_hash, auth_provider, phone, dob, gender,
  specialty, license_number, council, degree, experience, hospital_name,
  address, reg_certificate_url, cert_extracted_data, license_expiry_date,
  coalesce(verification_status, 'pending'),
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from public.users
where role = 'doctor'
on conflict (id) do nothing;

insert into public.pending_registrations
  (id, email, name, picture, password_hash, auth_provider, verification_status,
   created_at, updated_at)
select
  id, email, name, picture, password_hash, auth_provider, verification_status,
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from public.users
where role is null or role = 'none'
on conflict (id) do nothing;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFY (run after applying):
--   select
--     (select count(*) from public.users)                 as users_total,      -- expect 9
--     (select count(*) from public.patients)               as patients,        -- expect 4
--     (select count(*) from public.doctors)                as doctors,         -- expect 4
--     (select count(*) from public.pending_registrations)  as pending;         -- expect 1
--
-- REVERT (safe — `users` is untouched, nothing else references these tables
-- yet, so this only clears the copies):
--   truncate public.patients, public.doctors, public.pending_registrations;
-- ═══════════════════════════════════════════════════════════════════════
