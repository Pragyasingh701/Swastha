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
    return {
      answer: NO_RESULTS_MESSAGE,
      structured: { headline: NO_RESULTS_MESSAGE, keyFacts: [], caveat: '' },
      sources: [],
      noResultsFound: true,
    };
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

  let raw;
  try {
    raw = await generateGroundedAnswer(prompt);
  } catch (err) {
    throw new Error(`searchReports: answer generation failed: ${err.message}`);
  }

  const structured = parseStructuredAnswer(raw, excerpts);

  // De-duplicated source list in the order their best-matching chunk appeared.
  const sourceReports = reportIds.map((id) => reportById.get(id)).filter(Boolean);
  const verifiedUrls = await Promise.all(sourceReports.map((r) => verifyFileUrl(r.file_url)));
  const sources = sourceReports.map((r, i) => ({
    report_id: r.id,
    title: r.title,
    category: r.category,
    report_date: r.report_date,
    file_url: verifiedUrls[i],
  }));

  return { answer: structured.headline, structured, sources, noResultsFound: false };
}

// Some reports in the DB have a file_url that can never resolve — a bare
// filename with no host (from an old/broken upload path), or an absolute
// URL whose file no longer exists (e.g. a localhost dev upload that was
// never persisted). Rather than show a "View" link that 404s, verify it
// resolves first and null it out otherwise — the frontend already renders
// sources with no file_url as plain (non-clickable) text.
const FILE_CHECK_TIMEOUT_MS = 2500;

async function verifyFileUrl(fileUrl) {
  if (!fileUrl) return null;

  // Not a well-formed absolute URL (e.g. a bare filename like
  // "test_prescription.png") — the real file location is unknown/lost,
  // no amount of retrying fixes that.
  let parsed;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FILE_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(fileUrl, { method: 'HEAD', signal: controller.signal });
    return res.ok ? fileUrl : null;
  } catch {
    // Network error, timeout, or the host refused HEAD — treat as
    // unresolvable rather than risk showing a dead link.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildGroundedPrompt(query, excerpts) {
  const excerptBlock = excerpts
    .map((e) => `[Excerpt ${e.index} — report "${e.title}"${e.reportDate ? `, dated ${e.reportDate}` : ''}]\n${e.text}`)
    .join('\n\n');

  return `You are a careful medical records assistant. Answer the user's question using ONLY the excerpts below, which are taken from their own health records.

Strict rules:
- Only use information explicitly present in the excerpts. Do not use outside knowledge, do not guess, and never infer or invent facts, dates, dosages, or diagnoses that are not stated.
- If the excerpts do not contain enough information to answer the question, set "headline" to "I couldn't find this information in your health records." and leave "keyFacts" empty. Do not attempt a partial or speculative answer in that case.
- Do not give medical advice or recommendations beyond what is written in the excerpts — you are reporting what the records say, not interpreting or advising.

Excerpts:
${excerptBlock}

Question: ${query}

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "headline": "<one direct sentence answering the question>",
  "keyFacts": [
    { "label": "<short fact label, e.g. Medicine, Date, Value, Diagnosis>", "detail": "<the fact itself, verbatim or close to the excerpt>", "excerpt": <the excerpt number (1, 2, ...) this fact came from> }
  ],
  "caveat": "<optional one-sentence caveat, e.g. if the records are incomplete or dated — empty string if none>"
}

Rules for the JSON:
- "keyFacts" should have 0-6 items. Omit it (empty array) if the answer is a single simple fact already fully captured in "headline" — don't pad with redundant restatements.
- Every keyFacts item must be traceable to a specific excerpt number.`;
}

// Strips ```json fences etc. that free-tier chat models routinely wrap
// around JSON output despite being asked not to (same defensive parsing as
// rag/src/services/labInsightsService.js).
function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model output');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

// Falls back to treating the whole raw response as the headline if the
// model didn't return valid JSON — the feature degrades to a plain-text
// answer rather than failing outright.
function parseStructuredAnswer(raw, excerpts) {
  let parsed;
  try {
    parsed = extractJson(raw);
  } catch {
    return { headline: raw.trim(), keyFacts: [], caveat: '' };
  }

  const excerptByIndex = new Map(excerpts.map((e) => [e.index, e]));

  return {
    headline: typeof parsed.headline === 'string' && parsed.headline.trim() ? parsed.headline.trim() : raw.trim(),
    keyFacts: Array.isArray(parsed.keyFacts)
      ? parsed.keyFacts
          .filter((f) => f && f.detail)
          .map((f) => {
            const excerpt = excerptByIndex.get(Number(f.excerpt));
            return {
              label: typeof f.label === 'string' ? f.label.trim() : '',
              detail: String(f.detail).trim(),
              reportId: excerpt?.reportId || null,
              reportTitle: excerpt?.title || null,
            };
          })
      : [],
    caveat: typeof parsed.caveat === 'string' ? parsed.caveat.trim() : '',
  };
}

export { SIMILARITY_THRESHOLD, MATCH_COUNT, NO_RESULTS_MESSAGE };
