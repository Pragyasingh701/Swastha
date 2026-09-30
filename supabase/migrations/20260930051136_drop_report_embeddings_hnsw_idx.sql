-- Drop report_embeddings_embedding_hnsw_idx.
--
-- Every retrieval query against report_embeddings (match_report_embeddings,
-- see supabase/migrations/20260819175931_recreate_match_report_embeddings_rpc.sql)
-- filters `where re.patient_id = p_user_id` before ordering by vector
-- distance — retrieval is always scoped to one patient's chunks, never a
-- cross-patient ANN search over the whole table. An HNSW index is built to
-- accelerate approximate nearest-neighbor search across a LARGE global
-- vector space; here, the candidate set per query is already narrowed to
-- one patient's own chunks (in practice a small number of reports) by the
-- patient_id btree index (report_embeddings_user_id_idx) before any vector
-- comparison happens at all. At that scale, an exact scan over the
-- pre-filtered rows is not meaningfully slower than an ANN index lookup,
-- and it's exact (no recall loss from approximate search) rather than
-- approximate. Keeping the HNSW index was therefore paying its
-- maintenance/storage cost (rebuilt on every insert/update) for a
-- large-global-corpus optimization this table's actual per-patient query
-- pattern never needed.

drop index if exists public.report_embeddings_embedding_hnsw_idx;

-- ═══════════════════════════════════════════════════════════════════════
-- REVERT (run manually if needed):
--   create index if not exists report_embeddings_embedding_hnsw_idx
--     on public.report_embeddings using hnsw (embedding vector_cosine_ops);
-- ═══════════════════════════════════════════════════════════════════════
