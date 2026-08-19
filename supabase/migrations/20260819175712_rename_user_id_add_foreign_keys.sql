-- M5 — Rename user_id -> patient_id, add foreign keys and indexes
-- (Phase 3, decision D8: rename)
--
-- Prerequisite: M1 already removed every orphaned row, so every remaining
-- reports/report_embeddings/vault_table/family_members.user_id and every
-- doctor_patient.doctor_id/patient_id resolves to a live patients/doctors
-- row. Verified immediately before writing this migration:
--   reports=0 orphans, report_embeddings=0, vault_table=0, family_members=0
--   doctor_patient: 0 orphaned doctor_id, 0 orphaned patient_id,
--                   0 duplicate (doctor_id, patient_id) pairs
--
-- MUST ship together with matching code changes (same deploy):
--   backend/db/reports.js        - REPORTS_USER_ID_COLUMN default
--   backend/db/family.js         - FAMILY_USER_ID_COLUMN default
--   rag/src/services/embeddingService.js
--   rag/src/services/searchService.js
--   rag/src/services/conversationalSearchService.js
--   rag/src/langchain/reportRetriever.js (no change - keeps p_user_id param name)
--   rag/migrations/002_match_report_embeddings_function.sql body (M6, separate step)
--
-- The RPC match_report_embeddings is intentionally NOT touched here — it's
-- recreated in M6 right after this, so search has the smallest possible
-- window where the column is renamed but the function still says
-- `re.user_id`. Applying M5 and M6 back-to-back (not deploying code
-- between them) keeps that window from ever being user-visible.

begin;

-- 1. Rename columns
alter table public.reports           rename column user_id to patient_id;
alter table public.report_embeddings rename column user_id to patient_id;
alter table public.vault_table       rename column user_id to patient_id;
alter table public.family_members    rename column user_id to patient_id;

-- 2. Foreign keys to patients (cascade delete — matches the existing
--    report_embeddings.report_id -> reports.id ON DELETE CASCADE precedent)
alter table public.reports
  add constraint reports_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;

alter table public.report_embeddings
  add constraint report_embeddings_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;

alter table public.vault_table
  add constraint vault_table_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;

alter table public.family_members
  add constraint family_members_patient_fk foreign key (patient_id)
  references public.patients(id) on delete cascade;

-- 3. doctor_patient: foreign keys to both sides + the missing UNIQUE
--    (previously enforced only by a manual pre-check in
--    backend/db/doctorPatients.js — now a real DB constraint)
alter table public.doctor_patient
  add constraint doctor_patient_doctor_fk  foreign key (doctor_id)  references public.doctors(id)  on delete cascade,
  add constraint doctor_patient_patient_fk foreign key (patient_id) references public.patients(id) on delete cascade,
  add constraint doctor_patient_unique unique (doctor_id, patient_id);

-- 4. Indexes — reports.patient_id (and equivalents) were never indexed
--    despite being the filter on every timeline/vault/family query
--    (Phase 1 finding). doctor_patient.doctor_id/patient_id likewise.
create index if not exists reports_patient_id_idx           on public.reports(patient_id);
create index if not exists vault_table_patient_id_idx       on public.vault_table(patient_id);
create index if not exists family_members_patient_id_idx    on public.family_members(patient_id);
create index if not exists doctor_patient_doctor_id_idx     on public.doctor_patient(doctor_id);
create index if not exists doctor_patient_patient_id_idx    on public.doctor_patient(patient_id);
-- report_embeddings already has a user_id index from rag/migrations/001;
-- the rename above carries the index along automatically (Postgres renames
-- dependent index columns with the table column), so no new index needed
-- there — verified below in REVERT notes.

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT (run manually if needed):
--   begin;
--   alter table public.doctor_patient drop constraint doctor_patient_unique;
--   alter table public.doctor_patient drop constraint doctor_patient_patient_fk;
--   alter table public.doctor_patient drop constraint doctor_patient_doctor_fk;
--   alter table public.family_members drop constraint family_members_patient_fk;
--   alter table public.vault_table drop constraint vault_table_patient_fk;
--   alter table public.report_embeddings drop constraint report_embeddings_patient_fk;
--   alter table public.reports drop constraint reports_patient_fk;
--   alter table public.family_members rename column patient_id to user_id;
--   alter table public.vault_table rename column patient_id to user_id;
--   alter table public.report_embeddings rename column patient_id to user_id;
--   alter table public.reports rename column patient_id to user_id;
--   drop index if exists doctor_patient_patient_id_idx;
--   drop index if exists doctor_patient_doctor_id_idx;
--   drop index if exists family_members_patient_id_idx;
--   drop index if exists vault_table_patient_id_idx;
--   drop index if exists reports_patient_id_idx;
--   commit;
-- NOTE: revert must ALSO redeploy the pre-M5 code (backend/db/reports.js,
-- backend/db/family.js, rag/ services) — code and schema move together.
-- ═══════════════════════════════════════════════════════════════════════
