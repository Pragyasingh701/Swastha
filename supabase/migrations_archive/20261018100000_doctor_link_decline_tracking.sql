-- Decline tracking on doctor_patient, so a patient's "no" can't be undone by
-- the doctor deleting the card and asking again.
--
-- Until now a declined request was just a row with status 'declined', and the
-- doctor could delete that row (the card's "Cancel Request") and send a fresh
-- request, which the patient then had to decline all over again. The rule is
-- now: a decline is counted on the row, the row is kept (a doctor removing it
-- only hides it), the doctor may ask once more after a first decline, and after
-- a second decline there is a 24 hour cooldown before they can ask again. Then
-- every two further declines start another cooldown. Accepting resets all of
-- it. The rule itself lives in backend/db/doctorPatients.js.
--
--   decline_count     how many times the patient has declined this doctor
--   cooldown_until    when the doctor may ask again, set on every second decline
--   hidden_by_doctor  the doctor removed the card; the row stays so the counts do

begin;

alter table public.doctor_patient
  add column if not exists decline_count integer not null default 0,
  add column if not exists cooldown_until timestamptz,
  add column if not exists hidden_by_doctor boolean not null default false;

-- A request declined before this existed counts as one decline.
update public.doctor_patient
   set decline_count = 1
 where status = 'declined' and decline_count = 0;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   alter table public.doctor_patient
--     drop column if exists decline_count,
--     drop column if exists cooldown_until,
--     drop column if exists hidden_by_doctor;
-- ═══════════════════════════════════════════════════════════════════════
