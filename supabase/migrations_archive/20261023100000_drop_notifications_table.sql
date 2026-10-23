-- Drop the notifications table and the job that cleaned it.
--
-- Nothing reads or writes this table any more: the app no longer saves notification rows
-- (they were never shown anywhere), and the bell on the website is built straight from
-- the doctor_patient rows. Run this AFTER the code that stopped writing to it is deployed;
-- running it first only makes the old code log a harmless "table not found" warning.
--
-- This deletes the table's rows (old "Welcome back" / "Doctor viewed your profile" /
-- "timeline updated" messages that no one could see). Account deletion no longer needs to
-- clear it either.
--
-- REVERT (the rows themselves are not recoverable):
--   create the table again from the old baseline in git history, and
--   select cron.schedule('delete-expired-notifications', '0 * * * *',
--     $$delete from public.notifications where created_at < now() - interval '7 days'$$);

begin;

select cron.unschedule(jobid) from cron.job where jobname = 'delete-expired-notifications';

drop table if exists public.notifications;

commit;
