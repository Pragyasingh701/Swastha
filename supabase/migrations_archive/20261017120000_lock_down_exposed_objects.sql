-- Lock down database objects that were reachable with the project's public
-- (anon / authenticated) keys. The backend only ever uses the service_role
-- key, which is unaffected by anything below.
--
-- Found by checking the live project:
--   * public.auth_identities (a view unioning password_hash from patients,
--     doctors and pending_registrations) had full privileges granted to anon
--     and authenticated. A view runs with its owner's rights, so the
--     underlying tables' row-level security does not apply to it. Nothing in
--     the code reads it (login uses findUserBy* against the tables directly).
--   * match_report_embeddings(p_user_id, ...) was executable by PUBLIC, anon
--     and authenticated. It is SECURITY INVOKER, so RLS on report_embeddings
--     currently blocks it for those roles, but the backend is the only
--     caller, so the grant is dropped as defence in depth.
--   * The archive.orphaned_* tables (PHI of accounts deleted in 2026-08) had
--     row-level security disabled.

begin;

drop view if exists public.auth_identities;

revoke execute on function public.match_report_embeddings(character varying, vector, integer)
  from public, anon, authenticated;

alter table if exists archive.orphaned_doctor_patient_2026_08       enable row level security;
alter table if exists archive.orphaned_family_members_2026_08       enable row level security;
alter table if exists archive.orphaned_report_embeddings_2026_08    enable row level security;
alter table if exists archive.orphaned_reports_2026_08              enable row level security;
alter table if exists archive.orphaned_vault_table_2026_08          enable row level security;

revoke all on all tables in schema archive from anon, authenticated;
revoke usage on schema archive from anon, authenticated;

commit;

-- REVERT (not recommended): re-run the `create view` from
-- 20260819171220_create_patients_doctors_pending_tables.sql.
