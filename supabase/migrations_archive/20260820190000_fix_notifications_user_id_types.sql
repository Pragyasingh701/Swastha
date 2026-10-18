-- Swastha user IDs are application IDs such as `usr_g_...`, not UUIDs.
-- Notification recipients and actors must use the same type as patients.id
-- and doctors.id so inserts and recipient lookups work.

DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT DISTINCT con.conname
    FROM pg_constraint AS con
    JOIN pg_attribute AS attr
      ON attr.attrelid = con.conrelid
     AND attr.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'public.notifications'::regclass
      AND con.contype = 'f'
      AND attr.attname IN ('recipient_id', 'actor_id')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.notifications DROP CONSTRAINT %I',
      constraint_record.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.notifications
  ALTER COLUMN recipient_id TYPE text USING recipient_id::text,
  ALTER COLUMN actor_id TYPE text USING actor_id::text;

CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
  ON public.notifications (recipient_id, created_at DESC);