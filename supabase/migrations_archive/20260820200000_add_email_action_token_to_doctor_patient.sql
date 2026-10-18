-- Add email_action_token to doctor_patient — lets a patient accept/decline
-- a doctor's access request directly from a link in the confirmation
-- email, without logging in. Same one-shot token pattern already used for
-- family member authorization (see family_members.authorization_token /
-- 20260819* migrations): a random hex token is generated when the request
-- is created, emailed as an accept/decline link pair, and cleared the
-- moment the request is resolved (by either channel — email or the
-- notification bell) so a reused/stale email link fails safely instead of
-- silently re-applying.

begin;

alter table public.doctor_patient
  add column if not exists email_action_token text;

create unique index if not exists doctor_patient_email_action_token_idx
  on public.doctor_patient (email_action_token)
  where email_action_token is not null;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   drop index if exists public.doctor_patient_email_action_token_idx;
--   alter table public.doctor_patient drop column if exists email_action_token;
-- ═══════════════════════════════════════════════════════════════════════
