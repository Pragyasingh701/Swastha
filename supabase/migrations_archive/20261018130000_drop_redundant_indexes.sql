-- Drop indexes that a unique key already provides.
--
-- A unique constraint is backed by an index. Where a plain index covers the same
-- leading column(s), it only costs disk space and slows every write, and no query
-- can use it for anything the unique index cannot already do.
--
--   plain index (dropped)                         already covered by
--   ai_notice_acknowledgements_user_feature_idx   UNIQUE (user_id, feature, notice_version)
--   doctor_patient_doctor_id_idx                  doctor_patient_unique (doctor_id, patient_id)
--   idx_clinic_checkin_codes_code_date            UNIQUE (code, valid_date), exactly the same columns
--   report_embeddings_report_id_idx               UNIQUE (report_id, chunk_index)
--   vault_table_patient_id_idx                    UNIQUE (patient_id)
--
-- To look for indexes that nothing reads (judge these on the live database after a
-- few weeks of use, not from the schema):
--   select relname as table, indexrelname as index, idx_scan
--   from pg_stat_user_indexes where schemaname = 'public' order by idx_scan, relname;

begin;

drop index if exists public.ai_notice_acknowledgements_user_feature_idx;
drop index if exists public.doctor_patient_doctor_id_idx;
drop index if exists public.idx_clinic_checkin_codes_code_date;
drop index if exists public.report_embeddings_report_id_idx;
drop index if exists public.vault_table_patient_id_idx;

commit;
