-- Adds the 'last_report' mode value to ask_swastha_access_log and
-- ask_swastha_feedback's check constraints. Ask Swastha's RAG services
-- gained a dedicated "most recent report" resolution path
-- (searchService.js's answerLastReportQuestion, mode: 'last_report') for
-- "summarize my last report" style questions, distinct from the existing
-- full_context/retrieval/aggregate modes — without this, every insert
-- carrying that mode value violated the original check constraint
-- (ask_swastha_access_log_mode_check), so audit logging and feedback
-- storage both silently failed for every last-report question.

begin;

alter table public.ask_swastha_access_log drop constraint ask_swastha_access_log_mode_check;
alter table public.ask_swastha_access_log
  add constraint ask_swastha_access_log_mode_check
  check (mode in ('full_context', 'retrieval', 'aggregate', 'last_report'));

alter table public.ask_swastha_feedback drop constraint ask_swastha_feedback_mode_check;
alter table public.ask_swastha_feedback
  add constraint ask_swastha_feedback_mode_check
  check (mode in ('full_context', 'retrieval', 'aggregate', 'last_report'));

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT:
--   begin;
--   alter table public.ask_swastha_access_log drop constraint ask_swastha_access_log_mode_check;
--   alter table public.ask_swastha_access_log
--     add constraint ask_swastha_access_log_mode_check
--     check (mode in ('full_context', 'retrieval', 'aggregate'));
--   alter table public.ask_swastha_feedback drop constraint ask_swastha_feedback_mode_check;
--   alter table public.ask_swastha_feedback
--     add constraint ask_swastha_feedback_mode_check
--     check (mode in ('full_context', 'retrieval', 'aggregate'));
--   commit;
-- ═══════════════════════════════════════════════════════════════════════
