-- Clear the search chunks of reports that carry an AI summary in their notes.
--
-- A report's notes can hold the AI-written summary after an "[AI Analysis]" marker.
-- Older indexing could embed that summary as if it were record text, so Ask Swastha
-- could be handed an earlier AI answer as a "fact". Indexing now leaves the summary
-- out, but chunks already stored keep the old text, and a report that already has
-- chunks is never re-indexed.
--
-- This deletes the chunks of those reports (they are rebuilt from the clean text the
-- next time the owner opens Ask Swastha, which indexes any report without chunks).
-- Data only, no schema change, so the baseline schema is unchanged. One transaction.

begin;

delete from public.report_embeddings
where report_id in (
  select id from public.reports where notes like '%[AI Analysis]%'
);

commit;
