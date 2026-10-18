-- M7 — Drop the old `users` table and two confirmed-dead columns
-- (Phase 3, final step. IRREVERSIBLE without a backup restore.)
--
-- Prerequisites verified immediately before writing this migration:
--   - Zero references to .from('users') anywhere in backend/ or rag/
--   - Zero references to reports.updated_date anywhere in code
--   - M4 (code cutover) has been running and tested against
--     patients/doctors/pending_registrations
--   - A fresh, verified-non-empty backup of `users` was captured RIGHT
--     BEFORE this migration: backups/users-table-before-drop-2026-08-19.sql
--     (schema + all current data, gitignored)
--
-- Dead columns (from db-code-crossref.md, Phase 2):
--   reports.updated_date        — 0 code references, 0/12 rows populated
--   doctor_patient.updated_at   — 0 code references, NULL in all rows
--
-- NOT dropped (decision D6, kept deliberately): doctors.cert_extracted_data
-- and doctors.license_expiry_date — unpopulated today but intended for the
-- HPR certificate verification flow.

begin;

alter table public.reports        drop column if exists updated_date;
alter table public.doctor_patient drop column if exists updated_at;

drop table if exists public.users;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT (data restore only — code would also need reverting to the
-- pre-M4 users.js/auth.js/doctorPatients.js, which is a separate step):
--   psql "<connection string>" -f backups/users-table-before-drop-2026-08-19.sql
--   -- then re-add the two dropped columns if needed:
--   alter table public.reports add column updated_date timestamptz;
--   alter table public.doctor_patient add column updated_at timestamptz;
-- ═══════════════════════════════════════════════════════════════════════
