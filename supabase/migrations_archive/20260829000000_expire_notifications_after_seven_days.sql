-- Keep in-app notifications for seven days, then remove them automatically.
CREATE INDEX IF NOT EXISTS notifications_created_at_idx
  ON public.notifications (created_at);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'delete-expired-notifications',
  '0 * * * *',
  $$DELETE FROM public.notifications
    WHERE created_at < NOW() - INTERVAL '7 days'$$
)
WHERE NOT EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'delete-expired-notifications'
);