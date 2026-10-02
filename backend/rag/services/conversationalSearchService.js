// Conversational (multi-turn) RAG search.
//
// Kept deliberately separate from searchService.js: the one-shot
// POST /api/search path is untouched and other parts of the app still use
// it. Shared pieces (threshold, match count, no-results copy, JSON parsing,
// file_url verification) are imported from there rather than duplicated, so
// tuning stays in one place.
import { supabase } from '../config/supabase.js';
import { chatModel } from '../langchain/openRouterChatModel.js';
import { runAI } from '../config/aiClient.js';
import { ReportEmbeddingsRetriever } from '../langchain/reportRetriever.js';
import { getHistory, appendTurn } from '../langchain/sessionStore.js';
import { FULL_CONTEXT_MAX_CHARS } from '../config/env.js';
import {
  parseStructuredAnswer,
  verifyFileUrl,
  buildGroundedPrompt,
  generateNoMatchAnswer,
  loadPatientReportsForPrompt,
  buildFullContextExcerptText,
  filterSourcesToCited,
  isAggregateQuestion,
  answerAggregateQuestion,
  isLastReportQuestion,
  answerLastReportQuestion,
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
- CHECK FIRST, before doing anything else: does the follow-up contain a pronoun or implicit reference that only makes sense by looking at the conversation (e.g. "it", "that", "those", "what about X instead", "the first one")? If NOT — if the follow-up already names its own subject in full, with nothing needing to be looked up from an earlier turn — it is ALREADY standalone. Return it completely unchanged, character for character. This is the single most common mistake: merging the PREVIOUS topic into a new, unrelated follow-up that never asked about it. A question like "how many reports does this patient have in total" is a NEW, self-contained question — even though the previous turn was about something else entirely (e.g. allergies) — and must be returned exactly as asked, NOT rewritten into "how many allergy reports does this patient have."
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
 * Shared tail for both the full-context and retrieval paths: build the
 * prompt from whatever excerpts were assembled, generate, and shape the
 * response — identical generation/degraded-detection/citation/memory
 * behavior regardless of how the excerpts were sourced.
 *
 * `mode` is passed straight through onto the returned object (never used
 * internally) — it exists only so the caller (searchChat.js) can write it
 * into the access audit log without re-deriving which path actually ran.
 *
 * @param {{ standaloneQuestion: string, trimmedQuery: string, excerpts: object[], sourceReports: object[], sessionId: string, userId: string, mode: 'full_context'|'retrieval' }} params
 */
async function generateAndRespond({ standaloneQuestion, trimmedQuery, excerpts, sourceReports, sessionId, userId, mode }) {
  // Grounding uses the SAME prompt builder as the one-shot endpoint, so the
  // strict "only use the excerpts / say you couldn't find it" behaviour is
  // identical by construction rather than by a second copy that can drift.
  const prompt = buildGroundedPrompt(standaloneQuestion, excerpts);

  // Same detection as the one-shot /api/search path: call runAI directly
  // (not chatModel.invoke, which only returns text and discards `.ok`) so a
  // total provider failure surfaces as degraded:true instead of being
  // rendered as an ordinary answer.
  const gen = await runAI({ task: 'generation', input: prompt, label: 'chat' });

  if (!gen.ok) {
    // Do NOT write this turn to memory — the fallback sentence isn't a
    // real answer, and storing it as context would poison a later rewrite.
    return {
      answer: gen.text,
      structured: { headline: gen.text, keyFacts: [], caveat: '' },
      sources: [],
      noResultsFound: false,
      degraded: true,
      standaloneQuestion,
      sessionId,
      mode,
    };
  }

  const structured = parseStructuredAnswer(gen.text, excerpts);

  // Narrowed to the reports the answer actually cited (full-context mode in
  // particular hands the model EVERY report as a candidate source — most of
  // which a given answer never ends up drawing from) — see
  // filterSourcesToCited's doc comment in searchService.js.
  const citedSourceReports = filterSourcesToCited(sourceReports, structured.keyFacts);
  const verifiedUrls = await Promise.all(citedSourceReports.map((r) => verifyFileUrl(r.file_url)));
  const sources = citedSourceReports.map((r, i) => ({
    report_id: r.id,
    title: r.title,
    category: r.category,
    report_date: r.report_date,
    file_url: verifiedUrls[i],
  }));

  // Remember the ORIGINAL question (what the doctor actually typed) paired
  // with the answer — the rewrite is a retrieval detail, and storing it
  // would compound rewrites of rewrites over a long conversation.
  await appendTurn(sessionId, userId, trimmedQuery, structured.headline);

  return {
    answer: structured.headline,
    structured,
    sources,
    noResultsFound: false,
    standaloneQuestion,
    mode,
    sessionId,
  };
}

/**
 * Adaptive full-context mode: if a patient's entire report history (every
 * field a doctor might need to answer from — title, date, category,
 * hospital, doctor, diagnosis, medicines, notes) fits under
 * FULL_CONTEXT_MAX_CHARS once built into excerpt text, skip embedding and
 * vector search entirely and hand the model every report directly. This
 * avoids two failure modes similarity search has for a patient with only a
 * handful of reports: a chunk that's genuinely relevant but happens to fall
 * below SIMILARITY_THRESHOLD for an oddly-phrased question, and MATCH_COUNT
 * silently truncating to 5 chunks when a patient has more than 5 but the
 * question doesn't itself look like an aggregate question (isAggregateQuestion
 * only catches count/list-style phrasing, not "compare my last two visits"
 * style questions that also need more than 5 chunks to answer correctly).
 *
 * Reads directly from `reports` via the same loadPatientReportsForPrompt
 * used by answerAggregateQuestion — NOT from report_embeddings — so a
 * report that was never indexed (or whose indexing failed; see
 * embeddingService.js's fire-and-forget trigger) still appears here, unlike
 * the old chunk-based version of this function.
 *
 * Returns null (never throws) if the patient is over the char budget, or if
 * loadPatientReportsForPrompt's row limit was hit (a patient with more
 * reports than that limit is exactly the kind of large history this mode
 * isn't meant for) — in either case retrieval below runs exactly as before.
 *
 * @param {{ standaloneQuestion: string, trimmedQuery: string, userId: string, sessionId: string }} params
 * @returns {Promise<object|null>}
 */
async function tryFullContextAnswer({ standaloneQuestion, trimmedQuery, userId, sessionId }) {
  const { reports, truncated } = await loadPatientReportsForPrompt(userId);

  if (reports.length === 0) {
    // No reports at all for this patient — not this function's job to
    // decide what that means (the caller's retrieval path already has a
    // well-defined "nothing found" contract). Let it fall through.
    return null;
  }

  // A patient with more reports than loadPatientReportsForPrompt's row
  // limit is, by definition, too large a history for "hand the model
  // everything" — treat exactly like being over the char budget, without
  // spending time building excerpts for reports we'd only discard.
  if (truncated) {
    console.warn(
      `[conversationalSearch] session ${sessionId}: full-context row limit exceeded — falling back to retrieval`
    );
    return null;
  }

  const excerpts = reports.map((r, i) => ({
    index: i + 1,
    reportId: r.id,
    title: r.title || 'Untitled report',
    reportDate: r.report_date || null,
    text: buildFullContextExcerptText(r),
    similarity: 1, // not a similarity-ranked result — every report is included
  }));

  // Sized on the excerpt text actually built (labeled fields), not raw
  // chunk length — this is what the char budget is meant to bound, since
  // it's what actually goes into the prompt.
  const totalChars = excerpts.reduce((sum, e) => sum + e.text.length, 0);

  if (totalChars >= FULL_CONTEXT_MAX_CHARS) {
    return null;
  }

  // One source per report included — every report has one, since this
  // reads `reports` directly rather than joining from report_embeddings.
  const sourceReports = reports.map((r) => ({
    id: r.id,
    title: r.title || 'Untitled report',
    category: r.category || null,
    report_date: r.report_date || null,
    file_url: r.file_url || null,
  }));

  // Counts only — never report content — matching the existing
  // condense-question log line's privacy convention.
  console.log(
    `[conversationalSearch] session ${sessionId}: mode=full-context (${reports.length} reports, ${totalChars} chars)`
  );

  return generateAndRespond({ standaloneQuestion, trimmedQuery, excerpts, sourceReports, sessionId, userId, mode: 'full_context' });
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
  const trimmedQuery = query.trim();
  const standaloneQuestion = await condenseQuestion(trimmedQuery, history);
  const wasCondensed = standaloneQuestion !== trimmedQuery;

  if (wasCondensed) {
    // Never log the raw query/rewrite text — only shape, so this stays
    // useful for debugging the condense step without putting patient
    // question content in server logs.
    console.log(
      `[conversationalSearch] session ${sessionId}: condensed query (${trimmedQuery.length} chars -> ${standaloneQuestion.length} chars)`
    );
  }

  // Questions ABOUT the whole record set ("how many reports", "list all my
  // diagnoses", "why only 5?") can't be answered by top-K similarity search
  // — see searchService.js's isAggregateQuestion for why. Handle those
  // directly from full `reports` metadata instead of the embeddings
  // retriever, same as the one-shot /api/search endpoint. Unaffected by
  // full-context mode below — this path never touches embeddings either way.
  if (isAggregateQuestion(standaloneQuestion)) {
    const result = await answerAggregateQuestion(standaloneQuestion, userId);
    if (!result.noResultsFound) {
      await appendTurn(sessionId, userId, trimmedQuery, result.structured.headline);
    }
    return { ...result, standaloneQuestion, sessionId };
  }

  // "My last/latest/most recent report" — checked BEFORE full-context mode
  // below, which would otherwise hand the model every report with no
  // recency signal and leave it to infer "last" itself from Date: lines
  // under a strict literal-grounding prompt (the turn-1 "raw field dump"
  // behavior this fixes). Resolves directly to the single most recent
  // report instead.
  if (isLastReportQuestion(standaloneQuestion)) {
    const result = await answerLastReportQuestion(standaloneQuestion, userId);
    if (!result.noResultsFound && !result.degraded) {
      await appendTurn(sessionId, userId, trimmedQuery, result.structured.headline);
    }
    return { ...result, standaloneQuestion, sessionId };
  }

  // Adaptive full-context: a patient with a small enough total history gets
  // every report handed to the model directly, skipping embedding + vector
  // search — see tryFullContextAnswer's own doc comment for why. Returns
  // null (never throws) when the patient is over budget, in which case
  // retrieval below runs exactly as before.
  const fullContextResult = await tryFullContextAnswer({ standaloneQuestion, trimmedQuery, userId, sessionId });
  if (fullContextResult) {
    return fullContextResult;
  }

  // userId comes from the JWT (see routes/searchChat.js) and is applied
  // inside match_report_embeddings' SQL — retrieval cannot cross users.
  const retriever = new ReportEmbeddingsRetriever({ userId });
  const docs = await retriever.invoke(standaloneQuestion);

  if (docs.length === 0) {
    // Nothing above threshold: tailor the reply to the actual question
    // (same reasoning/helper as the one-shot endpoint — see
    // generateNoMatchAnswer) rather than one fixed sentence for every
    // zero-match case, and do NOT write this turn to memory — recording
    // "I couldn't find that" as context would poison later rewrites.
    const noMatch = await generateNoMatchAnswer(standaloneQuestion, 'chat-no-match');
    return {
      answer: noMatch.headline,
      structured: noMatch,
      sources: [],
      noResultsFound: true,
      standaloneQuestion,
      sessionId,
      mode: 'retrieval',
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

  const sourceReports = reportIds.map((id) => reportById.get(id)).filter(Boolean);

  // Counts only — never chunk/report content — same convention as the
  // full-context mode log line above.
  console.log(
    `[conversationalSearch] session ${sessionId}: mode=retrieval (${excerpts.length} chunks, ${sourceReports.length} reports)`
  );

  return generateAndRespond({ standaloneQuestion, trimmedQuery, excerpts, sourceReports, sessionId, userId, mode: 'retrieval' });
}
