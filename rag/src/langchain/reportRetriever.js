// A LangChain BaseRetriever over the EXISTING report_embeddings table.
//
// Why not LangChain's SupabaseVectorStore: that integration expects its own
// schema (a `content` column, a `metadata` jsonb column) and an RPC with a
// fixed signature — match_documents(query_embedding, match_count, filter).
// This project has `chunk_text` with no metadata column, and
// match_report_embeddings(p_user_id, p_query_embedding, p_match_count).
// Using SupabaseVectorStore would mean creating a second table and
// re-embedding everything. Subclassing BaseRetriever instead reuses the
// existing table, the existing HNSW index, and — critically — the existing
// RPC, which applies the user_id filter INSIDE the SQL (see
// migrations/002_match_report_embeddings_function.sql). That is a stronger
// guarantee than a caller-supplied metadata filter, which is what
// SupabaseVectorStore would have given us.
import { BaseRetriever } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { supabase } from '../config/supabase.js';
import { embedText } from '../config/aiClient.js';
import { MATCH_COUNT, SIMILARITY_THRESHOLD } from '../services/searchService.js';

export class ReportEmbeddingsRetriever extends BaseRetriever {
  lc_namespace = ['swastha', 'retrievers'];

  /**
   * @param {{ userId: string, matchCount?: number, similarityThreshold?: number }} opts
   */
  constructor({ userId, matchCount = MATCH_COUNT, similarityThreshold = SIMILARITY_THRESHOLD } = {}) {
    super();
    if (!userId) {
      // Hard requirement: a retriever with no user scope must not exist,
      // so this fails at construction rather than at query time.
      throw new Error('ReportEmbeddingsRetriever: userId is required');
    }
    this.userId = userId;
    this.matchCount = matchCount;
    this.similarityThreshold = similarityThreshold;
  }

  async _getRelevantDocuments(query) {
    let queryEmbedding;
    try {
      queryEmbedding = await embedText(query, { taskType: 'RETRIEVAL_QUERY' });
    } catch (err) {
      throw new Error(`ReportEmbeddingsRetriever: failed to embed query: ${err.message}`);
    }

    const { data: matches, error } = await supabase.rpc('match_report_embeddings', {
      p_user_id: this.userId,
      p_query_embedding: queryEmbedding,
      p_match_count: this.matchCount,
    });

    if (error) {
      throw new Error(`ReportEmbeddingsRetriever: pgvector search failed: ${error.message}`);
    }

    const relevant = (matches || []).filter((m) => m.similarity >= this.similarityThreshold);

    if (relevant.length === 0) {
      console.log(
        `[reportRetriever] no chunks above threshold ${this.similarityThreshold} for user ${this.userId} (best: ${
          matches?.[0]?.similarity ?? 'n/a'
        })`
      );
      return [];
    }

    return relevant.map(
      (m) =>
        new Document({
          pageContent: m.chunk_text,
          metadata: {
            reportId: m.report_id,
            chunkIndex: m.chunk_index,
            similarity: m.similarity,
          },
        })
    );
  }
}
