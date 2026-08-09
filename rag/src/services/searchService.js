import { supabase } from '../config/supabase.js';
import { embedText } from '../config/gemini.js';
import { generateGroundedAnswer } from '../config/openrouter.js';

const MATCH_COUNT = 5;
// Cosine similarity threshold below which a chunk is considered irrelevant.
// 1 - cosine_distance ranges [-1, 1] but for normalized text embeddings in
// practice sits in [0, 1]; 0.65 is a conservative cutoff that filters out
// "same language, unrelated topic" matches while keeping genuine hits.
// Tune based on observed results once you have real report data.
const SIMILARITY_THRESHOLD = 0.65;

const NO_RESULTS_MESSAGE =
  'No relevant records found in your health history for this question.';

/**
 * Full RAG search: embed the query, run pgvector similarity search scoped
 * to user_id, ground gemini-2.5-flash strictly in the retrieved excerpts,
 * and return the answer plus source report metadata.
 *
 * @param {string} query
 * @param {string} userId
 */
export async function searchReports(query, userId) {
  if (!query || !query.trim()) {
    throw new Error('searchReports: query is required');
  }
  if (!userId) {
    // Hard requirement: never search without a user scope.
    throw new Error('searchReports: user_id is required');
  }

  let queryEmbedding;
  try {
    queryEmbedding = await embedText(query, { taskType: 'RETRIEVAL_QUERY' });
  } catch (err) {
    throw new Error(`searchReports: failed to embed query: ${err.message}`);
  }

  const { data: matches, error: matchError } = await supabase.rpc('match_report_embeddings', {
    p_user_id: userId,
    p_query_embedding: queryEmbedding,
    p_match_count: MATCH_COUNT,
  });

  if (matchError) {
    throw new Error(`searchReports: pgvector similarity search failed: ${matchError.message}`);
  }

  const relevant = (matches || []).filter((m) => m.similarity >= SIMILARITY_THRESHOLD);

  if (relevant.length === 0) {
    console.log(
      `[searchService] no chunks above threshold ${SIMILARITY_THRESHOLD} for user ${userId} (best: ${
        matches?.[0]?.similarity ?? 'n/a'
      })`
    );
    return { answer: NO_RESULTS_MESSAGE, sources: [], noResultsFound: true };
  }

  // Pull the parent report metadata for citation/"view source" links.
  // Re-scoped by user_id again here even though report_embeddings.user_id
  // already guaranteed it — defense in depth against future refactors.
  const reportIds = [...new Set(relevant.map((m) => m.report_id))];
  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, title, category, report_date, file_url')
    .eq('user_id', userId)
    .in('id', reportIds);

  if (reportsError) {
    throw new Error(`searchReports: failed to load source reports: ${reportsError.message}`);
  }

  const reportById = new Map((reports || []).map((r) => [r.id, r]));

  const excerpts = relevant.map((m, i) => {
    const report = reportById.get(m.report_id);
    return {
      index: i + 1,
      reportId: m.report_id,
      title: report?.title || 'Untitled report',
      reportDate: report?.report_date || null,
      text: m.chunk_text,
      similarity: m.similarity,
    };
  });

  const prompt = buildGroundedPrompt(query, excerpts);

  let answer;
  try {
    answer = await generateGroundedAnswer(prompt);
  } catch (err) {
    throw new Error(`searchReports: answer generation failed: ${err.message}`);
  }

  // De-duplicated source list in the order their best-matching chunk appeared.
  const sources = reportIds
    .map((id) => reportById.get(id))
    .filter(Boolean)
    .map((r) => ({
      report_id: r.id,
      title: r.title,
      category: r.category,
      report_date: r.report_date,
      file_url: r.file_url,
    }));

  return { answer, sources, noResultsFound: false };
}

function buildGroundedPrompt(query, excerpts) {
  const excerptBlock = excerpts
    .map((e) => `[Excerpt ${e.index} — report "${e.title}"${e.reportDate ? `, dated ${e.reportDate}` : ''}]\n${e.text}`)
    .join('\n\n');

  return `You are a careful medical records assistant. Answer the user's question using ONLY the excerpts below, which are taken from their own health records.

Strict rules:
- Only use information explicitly present in the excerpts. Do not use outside knowledge, do not guess, and never infer or invent facts, dates, dosages, or diagnoses that are not stated.
- If the excerpts do not contain enough information to answer the question, say clearly: "I couldn't find this information in your health records." Do not attempt a partial or speculative answer in that case.
- Do not give medical advice or recommendations beyond what is written in the excerpts — you are reporting what the records say, not interpreting or advising.
- Be concise and factual.

Excerpts:
${excerptBlock}

Question: ${query}

Answer:`;
}

export { SIMILARITY_THRESHOLD, MATCH_COUNT, NO_RESULTS_MESSAGE };
