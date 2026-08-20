// Conversational (multi-turn) RAG search.
//
// Kept deliberately separate from searchService.js: the one-shot
// POST /api/search path is untouched and other parts of the app still use
// it. Shared pieces (threshold, match count, no-results copy, JSON parsing,
// file_url verification) are imported from there rather than duplicated, so
// tuning stays in one place.
import { supabase } from '../config/supabase.js';
import { chatModel } from '../langchain/openRouterChatModel.js';
import { ReportEmbeddingsRetriever } from '../langchain/reportRetriever.js';
import { getHistory, appendTurn } from '../langchain/sessionStore.js';
import {
  NO_RESULTS_MESSAGE,
  parseStructuredAnswer,
  verifyFileUrl,
  buildGroundedPrompt,
  isAggregateQuestion,
  answerAggregateQuestion,
} from './searchService.js';

/**
 * Step 1 of the chain: rewrite a follow-up into a standalone question.
 *
 * This is the piece that makes "what about in the last year specifically?"
 * work — that string alone embeds to nothing useful, because the subject
 * ("penicillin reactions") lives in the previous turn. Retrieval quality
 * depends entirely on searching with the resolved question, which is why
 * the rewrite happens BEFORE embedding rather than being left to the
 * answer model afterwards.
 */
async function condenseQuestion(question, history) {
  if (history.length === 0) return question;

  const transcript = history
    .map((m) => `${m._getType() === 'human' ? 'Doctor' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `Given the conversation below and a follow-up question, rewrite the follow-up as a standalone question that can be understood without the conversation.

Rules:
- Resolve pronouns and implicit references ("it", "that", "those", "the last year") using the conversation.
- Preserve every constraint from the follow-up (time ranges, specific drugs, specific values).
- Do NOT answer the question. Do NOT add information that is not in the conversation or the follow-up.
- If the follow-up is already standalone, return it unchanged.
- Return ONLY the rewritten question, with no preamble, quotes, or explanation.

Conversation:
${transcript}

Follow-up question: ${question}

Standalone question:`;

  try {
    const rewritten = await chatModel.invoke(prompt);
    const text = String(rewritten.content ?? rewritten).trim();
    // A rewrite that comes back empty or suspiciously long (the model
    // answered instead of rewriting) is discarded — falling back to the
    // raw question degrades follow-up quality but never breaks the turn.
    if (!text || text.length > question.length + 400) {
      console.warn('[conversationalSearch] discarding implausible rewrite, using raw question');
      return question;
    }
    return text;
  } catch (err) {
    console.warn(`[conversationalSearch] condense failed, using raw question: ${err.message}`);
    return question;
  }
}

/**
 * Full conversational RAG turn: condense -> retrieve -> ground -> remember.
 *
 * @param {{ query: string, userId: string, sessionId: string }} params
 */
export async function conversationalSearch({ query, userId, sessionId }) {
  if (!query || !query.trim()) throw new Error('conversationalSearch: query is required');
  if (!userId) throw new Error('conversationalSearch: userId is required');
  if (!sessionId) throw new Error('conversationalSearch: sessionId is required');

  const history = await getHistory(sessionId, userId);
  const standaloneQuestion = await condenseQuestion(query.trim(), history);

  if (standaloneQuestion !== query.trim()) {
    console.log(
      `[conversationalSearch] session ${sessionId}: condensed "${query.trim()}" -> "${standaloneQuestion}"`
    );
  }

  // Questions ABOUT the whole record set ("how many reports", "list all my
  // diagnoses", "why only 5?") can't be answered by top-K similarity search
  // — see searchService.js's isAggregateQuestion for why. Handle those
  // directly from full `reports` metadata instead of the embeddings
  // retriever, same as the one-shot /api/search endpoint.
  if (isAggregateQuestion(standaloneQuestion)) {
    const result = await answerAggregateQuestion(standaloneQuestion, userId);
    if (!result.noResultsFound) {
      await appendTurn(sessionId, userId, query.trim(), result.structured.headline);
    }
    return { ...result, standaloneQuestion, sessionId };
  }

  // userId comes from the JWT (see routes/searchChat.js) and is applied
  // inside match_report_embeddings' SQL — retrieval cannot cross users.
  const retriever = new ReportEmbeddingsRetriever({ userId });
  const docs = await retriever.invoke(standaloneQuestion);

  if (docs.length === 0) {
    // Nothing above threshold: return the same no-results contract as the
    // one-shot endpoint, and do NOT write this turn to memory — recording
    // "I couldn't find that" as context would poison later rewrites.
    return {
      answer: NO_RESULTS_MESSAGE,
      structured: { headline: NO_RESULTS_MESSAGE, keyFacts: [], caveat: '' },
      sources: [],
      noResultsFound: true,
      standaloneQuestion,
      sessionId,
    };
  }

  // Join to reports for citation metadata, re-scoped by patient_id as
  // defence in depth (same reasoning as searchService.js). M5, DB reorg
  // decision D8: reports.user_id was renamed to patient_id.
  const reportIds = [...new Set(docs.map((d) => d.metadata.reportId))];
  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, title, category, report_date, file_url')
    .eq('patient_id', userId)
    .in('id', reportIds);

  if (reportsError) {
    throw new Error(`conversationalSearch: failed to load source reports: ${reportsError.message}`);
  }

  const reportById = new Map((reports || []).map((r) => [r.id, r]));

  const excerpts = docs.map((d, i) => {
    const report = reportById.get(d.metadata.reportId);
    return {
      index: i + 1,
      reportId: d.metadata.reportId,
      title: report?.title || 'Untitled report',
      reportDate: report?.report_date || null,
      text: d.pageContent,
      similarity: d.metadata.similarity,
    };
  });

  // Grounding uses the SAME prompt builder as the one-shot endpoint, so the
  // strict "only use the excerpts / say you couldn't find it" behaviour is
  // identical by construction rather than by a second copy that can drift.
  // The standalone question is what gets asked, so the answer inherits the
  // conversational context without the history being available to invent from.
  const prompt = buildGroundedPrompt(standaloneQuestion, excerpts);

  let raw;
  try {
    const response = await chatModel.invoke(prompt);
    raw = String(response.content ?? response);
  } catch (err) {
    throw new Error(`conversationalSearch: answer generation failed: ${err.message}`);
  }

  const structured = parseStructuredAnswer(raw, excerpts);

  const sourceReports = reportIds.map((id) => reportById.get(id)).filter(Boolean);
  const verifiedUrls = await Promise.all(sourceReports.map((r) => verifyFileUrl(r.file_url)));
  const sources = sourceReports.map((r, i) => ({
    report_id: r.id,
    title: r.title,
    category: r.category,
    report_date: r.report_date,
    file_url: verifiedUrls[i],
  }));

  // Remember the ORIGINAL question (what the doctor actually typed) paired
  // with the answer — the rewrite is a retrieval detail, and storing it
  // would compound rewrites of rewrites over a long conversation.
  await appendTurn(sessionId, userId, query.trim(), structured.headline);

  return {
    answer: structured.headline,
    structured,
    sources,
    noResultsFound: false,
    standaloneQuestion,
    sessionId,
  };
}
