-- Drop doctor_patient.patient_code.
--
-- Nothing has ever written to this column (it is empty in every row) and nothing
-- reads it: a patient's code is looked up on the patients table, which keeps its own
-- patient_code. Removing the copy here stops it looking like a second place to
-- store the code. Runs as one transaction.

begin;

alter table public.doctor_patient
  drop column patient_code;

commit;
