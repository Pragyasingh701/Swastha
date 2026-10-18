-- Add status to doctor_patient — doctor link requests now require patient
-- acceptance instead of granting instant full access.
--
-- Existing rows are backfilled to 'accepted': they were created under the
-- old instant-link behaviour, before any accept/decline flow existed, so
-- treating them as already-accepted preserves current access for every
-- doctor/patient pair that's already linked — nobody's access changes as
-- a side effect of this migration.
--
-- New rows from linkDoctorToPatient() will default to 'pending' at the
-- application layer (not relying on the column default alone, so the
-- INSERT is explicit about intent) — see backend/db/doctorPatients.js.

begin;

alter table public.doctor_patient
  add column if not exists status text not null default 'pending';

alter table public.doctor_patient
  add constraint doctor_patient_status_check
  check (status in ('pending', 'accepted', 'declined'));

-- Backfill: every row that existed before this migration was created
-- under instant-link behaviour, so grandfather it in as accepted.
update public.doctor_patient set status = 'accepted';

create index if not exists doctor_patient_status_idx on public.doctor_patient(status);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   alter table public.doctor_patient drop constraint doctor_patient_status_check;
--   drop index if exists doctor_patient_status_idx;
--   alter table public.doctor_patient drop column if exists status;
-- ═══════════════════════════════════════════════════════════════════════
