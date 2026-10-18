-- Add responded_at to doctor_patient — the timestamp a patient
-- accepted/declined a request, distinct from created_at (when the doctor
-- SENT the request). Needed for the notification feed on both sides:
--   doctor:  "Request sent to X on <created_at>" +
--            "X accepted/declined on <responded_at>"
--   patient: "Dr. X requested access on <created_at>" +
--            "You accepted/declined on <responded_at>"
--
-- Existing rows (all pre-migration links, grandfathered to 'accepted' in
-- 20260820051121) have no real acceptance moment on record, so
-- responded_at is left NULL for them rather than backfilled to a fake
-- value — the notification feed treats a NULL responded_at as "no
-- response event to show" for old links, which is accurate.

begin;

alter table public.doctor_patient
  add column if not exists responded_at timestamp with time zone;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   alter table public.doctor_patient drop column if exists responded_at;
-- ═══════════════════════════════════════════════════════════════════════
