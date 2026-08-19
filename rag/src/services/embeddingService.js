import { supabase } from '../config/supabase.js';
// Routed through the shared failover client: rotates all 4 Gemini keys on
// quota/auth errors. Still THROWS on total exhaustion (never degrades
// silently) — a report that is silently unindexed is permanently unfindable.
import { embedTexts } from '../config/aiClient.js';
import { chunkText } from '../utils/chunkText.js';

// Fields folded into the embedded text alongside notes. diagnosis and
// medicines live in their own `reports` columns (shown directly in the UI
// card) but were previously NEVER embedded — only `notes` was chunked, so
// questions like "what medicines was this patient prescribed?" could find
// the right report by similarity but the retrieved chunk genuinely
// contained no drug names, and the grounded prompt correctly refused to
// answer rather than invent one. Folding these in fixes that at the
// source for both /api/search and /api/search/chat, which both read from
// the same report_embeddings table.
function buildEmbeddableText({ title, diagnosis, medicines, notes }) {
  const lines = [];
  if (title) lines.push(`Title: ${title}`);
  if (diagnosis) lines.push(`Diagnosis: ${diagnosis}`);
  if (medicines) lines.push(`Medicines: ${medicines}`);
  if (notes) lines.push(notes);
  return lines.join('\n');
}

/**
 * Process (or re-process) a single report's title/diagnosis/medicines/notes
 * into report_embeddings.
 *
 * Idempotency: upserts on the (report_id, chunk_index) unique constraint,
 * so re-running on the same content overwrites existing rows rather than
 * duplicating them. If the new content produces FEWER chunks than a
 * previous run, the leftover higher-index rows from the old run are
 * explicitly deleted — otherwise stale chunks from a previous, longer
 * version would remain searchable forever.
 *
 * Call this after any insert/update to `reports` that touches these fields.
 *
 * @param {object} report - must include id, user_id; title/diagnosis/
 *   medicines/notes are folded into the embedded text if present (category/
 *   report_date/file_url stay in `reports` itself — the search endpoint
 *   joins back to `reports` for that).
 * @returns {{ reportId: string|number, chunksWritten: number }}
 */
export async function processReportEmbeddings(report) {
  const { id: reportId, user_id: userId, title, diagnosis, medicines, notes } = report || {};

  if (!reportId || !userId) {
    throw new Error(
      `processReportEmbeddings: report must include id and user_id (got id=${reportId}, user_id=${userId})`
    );
  }

  const embeddableText = buildEmbeddableText({ title, diagnosis, medicines, notes });
  const chunks = chunkText(embeddableText);

  if (chunks.length === 0) {
    // Nothing to embed (e.g. notes cleared out). Remove any stale
    // embeddings from a previous version of this report so search never
    // returns text that no longer exists on the report.
    const { error: deleteAllError } = await supabase
      .from('report_embeddings')
      .delete()
      .eq('report_id', reportId);

    if (deleteAllError) {
      throw new Error(
        `processReportEmbeddings: failed clearing embeddings for report ${reportId} with empty notes: ${deleteAllError.message}`
      );
    }

    console.log(
      `[embeddingService] report ${reportId} has no embeddable text (title/diagnosis/medicines/notes all empty); embeddings cleared, 0 chunks written`
    );
    return { reportId, chunksWritten: 0 };
  }

  let vectors;
  try {
    vectors = await embedTexts(chunks, { taskType: 'RETRIEVAL_DOCUMENT' });
  } catch (err) {
    // Fail loudly — do not partially write, do not silently skip.
    throw new Error(
      `processReportEmbeddings: embedding generation failed for report ${reportId}: ${err.message}`
    );
  }

  const rows = chunks.map((chunk_text, chunk_index) => ({
    report_id: reportId,
    user_id: userId,
    chunk_text,
    embedding: vectors[chunk_index],
    chunk_index,
  }));

  const { error: upsertError } = await supabase
    .from('report_embeddings')
    .upsert(rows, { onConflict: 'report_id,chunk_index' });

  if (upsertError) {
    throw new Error(
      `processReportEmbeddings: upsert failed for report ${reportId}: ${upsertError.message}`
    );
  }

  // Clean up any leftover chunks from a previous, longer version of this
  // report's notes (e.g. notes shrank from 5 chunks to 3).
  const { error: pruneError } = await supabase
    .from('report_embeddings')
    .delete()
    .eq('report_id', reportId)
    .gte('chunk_index', chunks.length);

  if (pruneError) {
    throw new Error(
      `processReportEmbeddings: failed pruning stale chunks for report ${reportId}: ${pruneError.message}`
    );
  }

  console.log(
    `[embeddingService] report ${reportId}: wrote ${chunks.length} chunk(s) for user ${userId}`
  );

  return { reportId, chunksWritten: chunks.length };
}

/**
 * Delete all embeddings for a report — call this when a report is deleted
 * so search never surfaces chunks belonging to a report that no longer
 * exists.
 */
export async function deleteReportEmbeddings(reportId) {
  if (!reportId) return;
  const { error } = await supabase.from('report_embeddings').delete().eq('report_id', reportId);
  if (error) {
    throw new Error(`deleteReportEmbeddings: failed for report ${reportId}: ${error.message}`);
  }
}
