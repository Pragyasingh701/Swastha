-- Family-admin access: tie it to the member's account id, not to an email string.
--
-- Until now, "this family admin may open that patient's records" was decided by
-- comparing an email address written inside the member record's notes with the
-- patient's current email. That meant the access followed an email string (not the
-- person), and the patient had no way to see or end it.
--
-- This adds family_members.linked_patient_id: the id of the patient account that
-- approved the invite. The access check uses it, and the patient can list and
-- revoke it from their own Settings. Revoking clears it. If the patient deletes
-- their account the column is set to null, so the access ends by itself.
--
-- Existing approved invites are filled in from their email tag, so nobody loses
-- access they currently have. Runs as one transaction.

begin;

alter table public.family_members
  add column linked_patient_id character varying;

alter table public.family_members
  add constraint family_members_linked_patient_fk
  foreign key (linked_patient_id) references public.patients(id) on delete set null;

create index family_members_linked_patient_id_idx
  on public.family_members (linked_patient_id)
  where linked_patient_id is not null;

-- Backfill: members that went through the invite-by-email flow (requested AND
-- approved) and whose tagged email belongs to a patient account.
update public.family_members fm
set linked_patient_id = p.id
from public.patients p
where fm.authorization_status = 'approved'
  and fm.authorization_requested_at is not null
  and fm.authorization_approved_at is not null
  and fm.deleted_at is null
  and lower(btrim(substring(fm.notes from '\[Email:\s*([^\]]+)\]'))) = lower(p.email);

commit;
