-- Monthly housekeeping, run by the database itself (pg_cron) at midnight India time
-- at the end of every month, so it does not depend on the web server being awake.
--
-- What it clears (public.monthly_cleanup(), returns a JSON count of each):
--   clinic_checkin_codes   codes from earlier days. A code only works on the day it is
--                          shown, so old rows are dead weight (rows up to two days old are
--                          kept, so no clinic's "today" can ever be cut off).
--   pending_registrations  sign-ups that never chose patient or doctor and have not been
--                          touched for 30 days. The person simply registers again.
--   intake_sessions        sessions still "in progress" after 48 hours are marked
--                          abandoned. This is the same sweep as
--                          POST /api/intake-admin/sweep-abandoned (which still works if
--                          you want it to run more often). Nothing is deleted here.
--
-- Midnight at the end of the month in India (Asia/Kolkata, UTC+5:30, no daylight saving)
-- is 18:30 UTC on the last day. pg_cron cannot say "last day of the month", so the job
-- wakes at 18:30 UTC on days 28 to 31 and runs only when it is already the 1st in India.
--
-- Run it by hand any time, for example to try it:   select public.monthly_cleanup();
-- See past runs:   select * from cron.job_run_details order by start_time desc limit 5;
--
-- REVERT:
--   select cron.unschedule('monthly-cleanup');
--   drop function public.monthly_cleanup();

begin;

create extension if not exists "pg_cron" with schema "pg_catalog";

create or replace function public.monthly_cleanup()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  codes_deleted integer;
  pending_deleted integer;
  sessions_abandoned integer;
begin
  delete from public.clinic_checkin_codes
  where valid_date < (now() at time zone 'UTC')::date - 2;
  get diagnostics codes_deleted = row_count;

  delete from public.pending_registrations
  where updated_at < now() - interval '30 days';
  get diagnostics pending_deleted = row_count;

  update public.intake_sessions
  set status = 'abandoned', abandoned_at = now()
  where status = 'in_progress'
    and created_at < now() - interval '48 hours';
  get diagnostics sessions_abandoned = row_count;

  return jsonb_build_object(
    'clinic_checkin_codes_deleted', codes_deleted,
    'pending_registrations_deleted', pending_deleted,
    'intake_sessions_abandoned', sessions_abandoned
  );
end;
$$;

revoke all on function public.monthly_cleanup() from public, anon, authenticated;
grant all on function public.monthly_cleanup() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'monthly-cleanup';

select cron.schedule(
  'monthly-cleanup',
  '30 18 28-31 * *',
  $$select public.monthly_cleanup()
    where (now() at time zone 'Asia/Kolkata')::date
        = date_trunc('month', now() at time zone 'Asia/Kolkata')::date$$
);

commit;
