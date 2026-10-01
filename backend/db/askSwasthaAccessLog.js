import supabase from '../config/supabase.js';

const TABLE = 'ask_swastha_access_log';

/**
 * Writes one row describing a completed (or rejected) Ask Swastha request —
 * WHO accessed WHICH patient's records, never the question/excerpt/answer
 * text itself. Best-effort by design: an insert failure here must never
 * fail the underlying search request, so this never throws — it logs the
 * ids involved and returns.
 *
 * `mode`/`result_count` are null for a 403 (unlinked/expired access, or a
 * missing notice acknowledgement) — no search ever ran, so there is no mode
 * or result count to report.
 *
 * @param {{
 *   callerUserId: string,
 *   targetPatientId: string,
 *   isCrossPatient: boolean,
 *   route: 'search_chat'|'search',
 *   mode?: 'full_context'|'retrieval'|'aggregate'|null,
 *   resultCount?: number|null,
 *   degraded?: boolean,
 * }} entry
 */
export async function logAccess({
  callerUserId,
  targetPatientId,
  isCrossPatient,
  route,
  mode = null,
  resultCount = null,
  degraded = false,
}) {
  if (!supabase) return;

  try {
    const { error } = await supabase.from(TABLE).insert({
      caller_user_id: callerUserId,
      target_patient_id: targetPatientId,
      is_cross_patient: Boolean(isCrossPatient),
      route,
      mode,
      result_count: resultCount,
      degraded: Boolean(degraded),
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Ids only — never the query/answer that triggered this row — same
      // privacy convention as every other audit-adjacent log line in this
      // codebase (see conversationalSearchService.js's own log lines).
      console.error(
        `[askSwasthaAccessLog] insert failed for caller ${callerUserId}, target ${targetPatientId}, route ${route}:`,
        error.message
      );
    }
  } catch (err) {
    console.error(
      `[askSwasthaAccessLog] insert threw for caller ${callerUserId}, target ${targetPatientId}, route ${route}:`,
      err.message
    );
  }
}

export default { logAccess };
