-- Migration: remove the allopathic/ayurvedic treatment-method split.
--
-- Product decision (confirmed with the user): every doctor is now "just a
-- doctor" — the treatment-method-aware AI intake concept introduced by
-- 20260824000000_clinic_checkin_and_treatment_method.sql is being fully
-- reverted. The intake flow itself already collapsed to a single
-- allopathic-shaped question set (chief_complaint -> hpi -> drug_allergy ->
-- finalize) in backend/rag/services/intakeService.js, with the ayurvedic
-- question bank (backend/rag/services/intakeQuestions.js) deleted outright
-- rather than merged in — so nothing in the application reads or writes
-- these columns anymore.
--
-- Leaves clinic_checkin_codes untouched — the clinic check-in FEATURE
-- (a doctor-specific daily code a walk-in patient enters) is unrelated to
-- treatment method and stays exactly as it was.
--
-- Byte-identical copy of backend/migrations/ equivalent, same dual-copy
-- convention as every other migration pair in this repo.

begin;

-- doctor_method_changes was the audit trail for post-registration
-- treatment_method changes — no HTTP route ever called the db-layer
-- function that wrote to it (backend/db/clinicCheckin.js#recordMethodChange,
-- now deleted), so it never held any real data.
drop table if exists public.doctor_method_changes;

-- intake_method was snapshotted from doctors.treatment_method at session
-- creation (PRD §3.4) — nothing snapshots it anymore.
alter table public.intake_sessions
  drop column if exists intake_method;

alter table public.doctors
  drop column if exists treatment_method;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT: re-run 20260824000000_clinic_checkin_and_treatment_method.sql's
-- sections 2-4 (its section 1, clinic_checkin_codes, was never touched
-- here and needs no revert).
-- ═══════════════════════════════════════════════════════════════════════
