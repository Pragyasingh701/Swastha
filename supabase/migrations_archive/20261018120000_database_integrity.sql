-- Database integrity: make the database itself refuse bad data, so the rules do
-- not depend only on the application code getting every write right.
--
-- Every rule below was checked against the live data first (2026-10-18) and has
-- zero violations, so this applies cleanly. It runs as one transaction: if any
-- rule fails, none of it is applied.
--
-- Not added on purpose:
--   * notifications / consent records / feedback have no foreign key to a user,
--     because the user can be a patient OR a doctor (two different tables); the
--     account-erasure code deletes them instead (backend/db/accountErasure.js).
--   * doctors.verification_status values: doctor verification is on hold, and its
--     final set of states is not decided yet.

begin;

-- 1. A row that belongs to a patient must say which patient. Without an owner it
--    would never be shown to anyone and could never be cleaned up.
alter table public.reports        alter column patient_id set not null;
alter table public.family_members alter column patient_id set not null;
alter table public.vault_table    alter column patient_id set not null;
alter table public.doctor_patient alter column patient_id set not null;

-- 2. One family vault per patient. The app looks the vault up with
--    .maybeSingle(), which fails when two exist.
alter table public.vault_table
  add constraint vault_table_patient_id_key unique (patient_id);

-- 3. An accepted doctor link always has an expiry. A link accepted with no expiry
--    would never lapse, which is exactly the 24 hour rule being bypassed.
alter table public.doctor_patient
  add constraint doctor_patient_accepted_has_expiry
  check (status <> 'accepted' or access_expires_at is not null);

-- 4. Counters and ages stay sane.
alter table public.doctor_patient
  add constraint doctor_patient_decline_count_check check (decline_count >= 0);

alter table public.family_members
  add constraint family_members_age_check check (age is null or (age >= 0 and age <= 150));

-- 5. A family member's authorization is either waiting for the email approval or
--    approved (the only two values the app ever writes).
alter table public.family_members
  add constraint family_members_authorization_status_check
  check (authorization_status is null or authorization_status in ('pending', 'approved'));

commit;
