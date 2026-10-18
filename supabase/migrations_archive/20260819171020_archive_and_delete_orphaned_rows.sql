-- M1 — Archive and delete orphaned rows (Phase 3, decision D2)
--
-- 7 user IDs are referenced by child rows but have no `users` row (the
-- accounts were deleted at some point with no cascade). Verified in
-- db-schema-current.md / db-reorg-plan.md that this data is UNREACHABLE
-- today: every query is scoped by user_id from a JWT, and login requires a
-- `users` row, so these rows can never be returned to any client. This
-- migration does not change what any user can see.
--
-- Safety: every affected row is copied into archive.* tables BEFORE
-- deletion, and the whole migration runs in one transaction — if anything
-- fails, nothing is deleted. Revert instructions are in db-reorg-plan.md
-- (M1) and at the bottom of this file.
--
-- Dry-run verified before writing this file:
--   reports=5  report_embeddings=5  vault_table=5  family_members=7
--   doctor_patient(dangling doctor)=2   TOTAL=24 rows
--   7 of 12 reports (belonging to LIVE users) are NOT touched.

begin;

create schema if not exists archive;

-- 1. Archive (create-as-select, so column shape always matches the source
--    table exactly, no matter future drift)
create table archive.orphaned_reports_2026_08 as
  select r.*
  from public.reports r
  left join public.users u on u.id = r.user_id
  where u.id is null;

create table archive.orphaned_report_embeddings_2026_08 as
  select e.*
  from public.report_embeddings e
  left join public.users u on u.id = e.user_id
  where u.id is null;

create table archive.orphaned_vault_table_2026_08 as
  select v.*
  from public.vault_table v
  left join public.users u on u.id = v.user_id
  where u.id is null;

create table archive.orphaned_family_members_2026_08 as
  select f.*
  from public.family_members f
  left join public.users u on u.id = f.user_id
  where u.id is null;

create table archive.orphaned_doctor_patient_2026_08 as
  select d.*
  from public.doctor_patient d
  left join public.users u on u.id = d.doctor_id
  where u.id is null;

-- 2. Delete from live tables — children before parents (report_embeddings
--    before reports) so no FK violation is possible, even though
--    report_embeddings.report_id already cascades.
delete from public.report_embeddings e
  where not exists (select 1 from public.users u where u.id = e.user_id);

delete from public.reports r
  where not exists (select 1 from public.users u where u.id = r.user_id);

delete from public.vault_table v
  where not exists (select 1 from public.users u where u.id = v.user_id);

delete from public.family_members f
  where not exists (select 1 from public.users u where u.id = f.user_id);

delete from public.doctor_patient d
  where not exists (select 1 from public.users u where u.id = d.doctor_id);

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT (run manually if needed — restores exactly what this migration
-- removed; safe even after M2/M3 since it only touches the original
-- tables and does not conflict with the new patients/doctors tables):
--
--   begin;
--   insert into public.reports select * from archive.orphaned_reports_2026_08;
--   insert into public.report_embeddings select * from archive.orphaned_report_embeddings_2026_08;
--   insert into public.vault_table select * from archive.orphaned_vault_table_2026_08;
--   insert into public.family_members select * from archive.orphaned_family_members_2026_08;
--   insert into public.doctor_patient select * from archive.orphaned_doctor_patient_2026_08;
--   commit;
-- ═══════════════════════════════════════════════════════════════════════
