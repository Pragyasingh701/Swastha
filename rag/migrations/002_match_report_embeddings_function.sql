-- RPC function for similarity search, callable via supabase-js `.rpc()`.
-- The Supabase JS client has no query-builder support for the pgvector
-- `<=>` operator, so similarity search is expressed as a plain SQL function
-- and invoked from Node instead.
--
-- SECURITY: p_user_id is a required, non-optional filter applied INSIDE the
-- query (not left to the caller to add afterwards) — this is what
-- guarantees a query can never return another patient's chunks, regardless
-- of what the calling code does.

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
  where re.user_id = p_user_id
  order by re.embedding <=> p_query_embedding
  limit p_match_count;
$$;
