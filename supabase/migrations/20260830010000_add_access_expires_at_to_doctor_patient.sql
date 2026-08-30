-- Add access_expires_at to doctor_patient — once a patient accepts a
-- doctor's request, access is no longer permanent: it now lapses 24 hours
-- after responded_at. This column carries that expiry moment, computed
-- and set on acceptance (see backend/db/doctorPatients.js's
-- resolveDoctorLinkRequest). NULL means "no expiry on record" — either the
-- link isn't accepted yet, or it's an old accepted row from before this
-- migration.
--
-- Existing accepted rows are backfilled from their own responded_at (or,
-- for pre-20260820063613 rows with no responded_at at all, created_at) so
-- they immediately become subject to the same 24h rule rather than being
-- grandfathered into permanent access.

begin;

alter table public.doctor_patient
  add column if not exists access_expires_at timestamp with time zone;

update public.doctor_patient
set access_expires_at = coalesce(responded_at, created_at) + interval '24 hours'
where status = 'accepted' and access_expires_at is null;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   alter table public.doctor_patient drop column if exists access_expires_at;
-- ═══════════════════════════════════════════════════════════════════════
