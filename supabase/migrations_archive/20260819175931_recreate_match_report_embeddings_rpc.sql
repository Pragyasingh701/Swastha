-- M6 — Recreate match_report_embeddings for the renamed column
-- (Phase 3, follows directly from M5's report_embeddings.user_id ->
-- patient_id rename)
--
-- The RPC's internal SQL referenced `re.user_id`, which no longer exists
-- after M5. This recreates it against `re.patient_id`.
--
-- Parameter name p_user_id is DELIBERATELY kept unchanged — it's an
-- external API surface called from rag/src/services/searchService.js:40
-- and rag/src/langchain/reportRetriever.js:47, both of which pass
-- `p_user_id: this.userId` / `p_user_id: userId`. Renaming the parameter
-- would require touching those call sites for no functional benefit; only
-- the internal column reference needs to change. This is the same design
-- called out in db-reorg-plan.md's M6.
--
-- Original definition: rag/migrations/002_match_report_embeddings_function.sql

create or replace function public.match_report_embeddings(
  p_user_id character varying,
  p_query_embedding vector(768),
  p_match_count integer default 5
)
returns table (
  id bigint,
  report_id bigint,
  chunk_text text,
  chunk_index integer,
  similarity float
)
language sql
stable
as $$
  select
    re.id,
    re.report_id,
    re.chunk_text,
    re.chunk_index,
    1 - (re.embedding <=> p_query_embedding) as similarity
  from public.report_embeddings re
  where re.patient_id = p_user_id
  order by re.embedding <=> p_query_embedding
  limit p_match_count;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT: re-run rag/migrations/002_match_report_embeddings_function.sql
-- (its `where re.user_id = p_user_id` only works if report_embeddings has
-- been reverted back to user_id first — i.e. revert M5 before this).
-- ═══════════════════════════════════════════════════════════════════════
