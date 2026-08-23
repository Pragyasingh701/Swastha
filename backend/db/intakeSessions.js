import supabase from '../config/supabase.js';

/**
 * Doctor-facing priority queue (Module A, Phase 3 — PRD §6.2/§8). A plain
 * priority-sorted read with no AI/generation step, so it lives here next to
 * the other doctor-patient queries rather than in rag/ (which is only
 * reached for actual generation work — summaries, search, the dialogue
 * engine itself). The 'accepted' doctor_patient link gate happens in the
 * caller (routes/doctorPatients.js), same boundary as
 * getDoctorPatients/isDoctorLinkedToPatient — this function trusts the
 * patientIds list it's given.
 *
 * priority is set directly from the dialogue engine's red_flag output
 * (intakeService.js) — no separate detection pass here, per PRD §6.2.
 *
 * @param {string[]} patientIds - already-verified 'accepted'-linked patient ids
 * @returns {Promise<Array<object>>} sessions sorted priority desc, created_at asc
 */
export async function getIntakeQueueForPatients(patientIds) {
  if (!Array.isArray(patientIds) || patientIds.length === 0 || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('intake_sessions')
    .select('id, patient_id, chief_complaint, priority, red_flag_reason, status, created_at, completed_at')
    .in('patient_id', patientIds)
    // 'flagged' sorts before 'routine' alphabetically-descending purely by
    // coincidence of the two literal strings chosen in the PRD's check
    // constraint — this is NOT relying on alphabetical order by design, it's
    // verified against the actual constraint values ('routine'/'flagged')
    // and re-asserted with an explicit CASE below so a future third
    // priority value can't silently reorder the queue.
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`getIntakeQueueForPatients: failed to load sessions: ${error.message}`);
  }

  const sessions = data || [];
  // Explicit priority ordering (flagged first) rather than trusting the
  // string-sort coincidence above — stable sort keeps created_at ascending
  // within each priority group.
  return sessions.sort((a, b) => {
    if (a.priority === b.priority) return 0;
    return a.priority === 'flagged' ? -1 : 1;
  });
}

/**
 * Single session detail (doctor clicking into a queue row) — full
 * structured_history (SOCRATES fields, drug/allergy) for the structured
 * summary view. Ownership (patient_id belongs to an 'accepted'-linked
 * patient) is verified by the caller, same as getIntakeQueueForPatients —
 * this function trusts the patientIds list it's given.
 *
 * @param {string} sessionId
 * @param {string[]} patientIds - already-verified 'accepted'-linked patient ids
 * @returns {Promise<object|null>} the session row, or null if not found /
 *   not owned by one of patientIds
 */
export async function getIntakeSessionForPatients(sessionId, patientIds) {
  if (!sessionId || !Array.isArray(patientIds) || patientIds.length === 0 || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('intake_sessions')
    .select('id, patient_id, chief_complaint, structured_history, priority, red_flag_reason, status, created_at, completed_at')
    .eq('id', sessionId)
    .in('patient_id', patientIds)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`getIntakeSessionForPatients: failed to load session: ${error.message}`);
  }

  return data || null;
}
