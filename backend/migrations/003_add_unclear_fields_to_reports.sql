-- Adds unclear_fields to the existing `reports` table: a list of field
-- names (doctor, hospital, reportDate, diagnosis, medicines, notes) that
-- AI extraction (rag/src/config/gemini.js extractReportFromImage) couldn't
-- confidently read from an uploaded prescription image — most commonly
-- illegible doctor handwriting — and that the patient also left blank
-- when reviewing the auto-filled form.
--
-- Surfaced on the Timeline card/detail view so a clinician looking at the
-- record later knows to check the original uploaded document (file_url)
-- for those specific fields rather than trusting an empty value as
-- "nothing was prescribed".
--
-- No `reports` table CREATE here — this project's `reports` table was
-- created directly in Supabase, not via a tracked migration (see
-- backend/db/reports.js for the columns it already expects).

alter table public.reports
  add column if not exists unclear_fields text[] not null default '{}';
