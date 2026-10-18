-- When the current access request was sent, so a request nobody answers can
-- lapse.
--
-- A doctor can no longer cancel a request that is waiting for the patient
-- (cancelling and re-sending was a way to spam a patient with emails). Instead
-- a request lasts 24 hours from the moment it is sent. If the patient has not
-- answered by then it expires: the patient can no longer accept or decline it,
-- and the doctor may send a new one. created_at is when the link row first
-- appeared, so it can't serve as that moment once a row is reopened for a new
-- request. The rule itself lives in backend/db/doctorPatients.js.

begin;

alter table public.doctor_patient
  add column if not exists requested_at timestamptz;

-- Requests already waiting are dated from when their row was created.
update public.doctor_patient
   set requested_at = created_at
 where requested_at is null;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   alter table public.doctor_patient drop column if exists requested_at;
-- ═══════════════════════════════════════════════════════════════════════
