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
 * doctorId scoping: a session created via clinic check-in (routes/clinic.js)
 * has doctor_id set to that SPECIFIC doctor and must only ever appear in
 * their queue — a patient accepted-linked to multiple doctors (e.g. a
 * remote allopathic doctor AND a walk-in Ayurvedic doctor scanned via a
 * clinic code) was otherwise showing that session in every one of their
 * linked doctors' queues, not just the doctor it actually belongs to (bug,
 * confirmed with the user). A session with doctor_id IS NULL (started via
 * the plain "Start Visit Intake" flow, no doctor picked) is unchanged —
 * still visible to every one of the patient's linked doctors, since nothing
 * has claimed it yet.
 *
 * @param {string[]} patientIds - already-verified 'accepted'-linked patient ids
 * @param {string} doctorId - the calling doctor's own id
 * @returns {Promise<Array<object>>} sessions sorted priority desc, created_at asc
 */
export async function getIntakeQueueForPatients(patientIds, doctorId) {
  if (!Array.isArray(patientIds) || patientIds.length === 0 || !doctorId || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('intake_sessions')
    .select('id, patient_id, doctor_id, chief_complaint, priority, red_flag_reason, status, origin, intake_method, doctor_action, created_at, completed_at')
    .in('patient_id', patientIds)
    // Only this doctor's own claimed sessions, or unclaimed (doctor_id null)
    // ones — see the doctorId-scoping note above.
    .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`)
    // Doctor-actioned rows (Completed / Removed) drop out of the live
    // queue — they're not deleted, just no longer shown here. See
    // getIntakeActionHistoryForDoctor below for where they surface instead.
    .is('doctor_action', null)
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
 * this function trusts the patientIds list it's given. Also doctorId-scoped
 * the same way getIntakeQueueForPatients is (see its comment) — a doctor
 * cannot open another doctor's claimed session's detail view even by
 * already knowing its sessionId.
 *
 * @param {string} sessionId
 * @param {string[]} patientIds - already-verified 'accepted'-linked patient ids
 * @param {string} doctorId - the calling doctor's own id
 * @returns {Promise<object|null>} the session row, or null if not found /
 *   not owned by one of patientIds / claimed by a different doctor
 */
export async function getIntakeSessionForPatients(sessionId, patientIds, doctorId) {
  if (!sessionId || !Array.isArray(patientIds) || patientIds.length === 0 || !doctorId || !supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('intake_sessions')
    .select('id, patient_id, doctor_id, chief_complaint, structured_history, priority, red_flag_reason, status, origin, intake_method, doctor_action, created_at, completed_at')
    .eq('id', sessionId)
    .in('patient_id', patientIds)
    .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`getIntakeSessionForPatients: failed to load session: ${error.message}`);
  }

  return data || null;
}

/**
 * Marks a queue row as Completed or Removed by the doctor — sets
 * intake_sessions.doctor_action (so it drops out of the live queue) and
 * appends an audit row to intake_session_actions. Ownership (session's
 * patient_id belongs to one of the caller-doctor's accepted-linked
 * patients) must already be verified by the caller (route), same pattern
 * as getIntakeSessionForPatients — this function trusts the patientIds
 * list it's given and re-selects with the same .in('patient_id', ...)
 * filter so a doctor cannot action a session outside their linked patients
 * even if they already knew the sessionId.
 *
 * @param {{ sessionId: string, doctorId: string, patientIds: string[], action: 'completed'|'removed' }} params
 * @returns {Promise<object|null>} the updated session row, or null if not
 *   found / not owned by one of patientIds (caller returns 404, not 403).
 */
export async function setIntakeSessionDoctorAction({ sessionId, doctorId, patientIds, action }) {
  if (!sessionId || !doctorId || !Array.isArray(patientIds) || patientIds.length === 0 || !supabase) {
    return null;
  }
  if (!['completed', 'removed'].includes(action)) {
    throw new Error(`setIntakeSessionDoctorAction: invalid action "${action}"`);
  }

  const { data: updated, error: updateError } = await supabase
    .from('intake_sessions')
    .update({ doctor_action: action })
    .eq('id', sessionId)
    .in('patient_id', patientIds)
    // Same doctorId-scoping as getIntakeQueueForPatients/
    // getIntakeSessionForPatients above — a doctor cannot Complete/Remove a
    // session claimed by a different doctor, even if they already knew its
    // sessionId (e.g. from when it briefly leaked into their queue before
    // this fix).
    .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`)
    .select('id, patient_id, doctor_action')
    .maybeSingle();

  if (updateError && updateError.code !== 'PGRST116') {
    throw new Error(`setIntakeSessionDoctorAction: failed to update session: ${updateError.message}`);
  }
  if (!updated) return null; // not found, or not one of this doctor's accepted-linked patients

  const { error: auditError } = await supabase.from('intake_session_actions').insert({
    session_id: updated.id,
    doctor_id: doctorId,
    patient_id: updated.patient_id,
    action,
  });
  if (auditError) {
    throw new Error(`setIntakeSessionDoctorAction: failed to write audit row: ${auditError.message}`);
  }

  return updated;
}

/**
 * History of every Complete/Remove action this doctor has taken across
 * their accepted-linked patients — newest first. Joined against
 * intake_sessions for the display fields (patient/chief complaint/etc.)
 * a history view needs; patientIds gates which sessions are visible, same
 * ownership boundary as getIntakeQueueForPatients.
 *
 * @param {string} doctorId
 * @param {string[]} patientIds - already-verified 'accepted'-linked patient ids
 */
export async function getIntakeActionHistoryForDoctor(doctorId, patientIds) {
  if (!doctorId || !Array.isArray(patientIds) || patientIds.length === 0 || !supabase) {
    return [];
  }

  const { data: actions, error: actionsError } = await supabase
    .from('intake_session_actions')
    .select('id, session_id, patient_id, action, acted_at')
    .eq('doctor_id', doctorId)
    .in('patient_id', patientIds)
    .order('acted_at', { ascending: false });

  if (actionsError) {
    throw new Error(`getIntakeActionHistoryForDoctor: failed to load actions: ${actionsError.message}`);
  }
  if (!actions || actions.length === 0) return [];

  const sessionIds = [...new Set(actions.map((a) => a.session_id))];
  const { data: sessions, error: sessionsError } = await supabase
    .from('intake_sessions')
    .select('id, chief_complaint, priority, red_flag_reason, origin, intake_method, created_at')
    .in('id', sessionIds);

  if (sessionsError) {
    throw new Error(`getIntakeActionHistoryForDoctor: failed to load sessions: ${sessionsError.message}`);
  }
  const sessionById = new Map((sessions || []).map((s) => [s.id, s]));

  // Most recent action per session wins for display purposes (a session
  // could in principle be actioned more than once — e.g. removed, then
  // later marked completed from the history view — the audit log below
  // keeps every event, but the queue-history LIST shows one row per
  // session using its latest action).
  const latestBySession = new Map();
  for (const a of actions) {
    if (!latestBySession.has(a.session_id)) latestBySession.set(a.session_id, a);
  }

  return [...latestBySession.values()].map((a) => ({
    session_id: a.session_id,
    patient_id: a.patient_id,
    action: a.action,
    acted_at: a.acted_at,
    ...sessionById.get(a.session_id),
  }));
}
