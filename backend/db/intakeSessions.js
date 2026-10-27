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
 * remote doctor AND a walk-in doctor scanned via a clinic code) was
 * otherwise showing that session in every one of their linked doctors'
 * queues, not just the doctor it actually belongs to (bug, confirmed with
 * the user). A session with doctor_id IS NULL (started via
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
    .select('id, patient_id, doctor_id, chief_complaint, priority, red_flag_reason, status, origin, doctor_action, created_at, completed_at')
    .in('patient_id', patientIds)
    // Only this doctor's own claimed sessions, or unclaimed (doctor_id null)
    // ones — see the doctorId-scoping note above.
    .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`)
    // What this doctor has Completed or Removed is taken out of THEIR queue below (from their own
    // rows in intake_session_actions), not by a flag on the shared session row: a patient seen by
    // two doctors, or a session nobody has claimed, must not vanish for doctor B because doctor A
    // dismissed it. See getIntakeActionHistoryForDoctor for where it shows up instead.
    // Issue #10 fix (audit report): 'abandoned' sessions (see
    // abandonStaleIntakeSessions below) are excluded from the live queue —
    // the whole point of the sweep is to stop a patient who genuinely
    // walked away from cluttering the doctor's active view. Not deleted,
    // and a patient who returns un-abandons it back to in_progress (Issue
    // #4's resume route), which puts it right back in this result set.
    .neq('status', 'abandoned')
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

  const visible = await withoutSessionsThisDoctorHandled(data || [], doctorId);
  // Explicit priority ordering (flagged first) rather than trusting the
  // string-sort coincidence above — stable sort keeps created_at ascending
  // within each priority group.
  return visible.sort((a, b) => {
    if (a.priority === b.priority) return 0;
    return a.priority === 'flagged' ? -1 : 1;
  });
}

const ACTION_LOOKUP_CHUNK = 100; // keeps the id list in the request URL short

// Drops the sessions this doctor has already Completed or Removed. A session that carries the old
// shared `doctor_action` flag but has no action row at all (written before action rows existed)
// stays hidden, as it always was; one that other doctors handled is still shown to this one.
async function withoutSessionsThisDoctorHandled(sessions, doctorId) {
  if (sessions.length === 0) return sessions;

  const ids = sessions.map((s) => s.id);
  const actionsBySession = new Map(); // session id -> Set of doctor ids who actioned it
  for (let i = 0; i < ids.length; i += ACTION_LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from('intake_session_actions')
      .select('session_id, doctor_id')
      .in('session_id', ids.slice(i, i + ACTION_LOOKUP_CHUNK));
    if (error) {
      throw new Error(`getIntakeQueueForPatients: failed to load doctor actions: ${error.message}`);
    }
    for (const row of data || []) {
      if (!actionsBySession.has(row.session_id)) actionsBySession.set(row.session_id, new Set());
      actionsBySession.get(row.session_id).add(row.doctor_id);
    }
  }

  return sessions.filter((session) => {
    const handledBy = actionsBySession.get(session.id);
    if (handledBy?.has(doctorId)) return false;
    // Old shared flag with nobody on record as having set it: keep it hidden.
    if (session.doctor_action && !handledBy) return false;
    return true;
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
    .select('id, patient_id, doctor_id, chief_complaint, structured_history, priority, red_flag_reason, status, origin, doctor_action, created_at, completed_at')
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
 * Detail for a session THIS doctor already completed or removed. It is the
 * doctor's own record of the problems they handled, so it opens even after the
 * patient's 24 hour access has ended. Scoped to the doctor's own action rows
 * (intake_session_actions), so it never exposes a session the doctor did not
 * act on.
 *
 * @param {string} sessionId
 * @param {string} doctorId - the calling doctor's own id
 * @returns {Promise<object|null>} the session row, or null if this doctor never
 *   actioned it
 */
export async function getIntakeSessionActionedByDoctor(sessionId, doctorId) {
  if (!sessionId || !doctorId || !supabase) {
    return null;
  }

  const { data: actions, error: actionError } = await supabase
    .from('intake_session_actions')
    .select('id')
    .eq('session_id', sessionId)
    .eq('doctor_id', doctorId)
    .limit(1);

  if (actionError) {
    throw new Error(`getIntakeSessionActionedByDoctor: failed to check actions: ${actionError.message}`);
  }
  if (!actions || actions.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from('intake_sessions')
    .select('id, patient_id, doctor_id, chief_complaint, structured_history, priority, red_flag_reason, status, origin, doctor_action, created_at, completed_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`getIntakeSessionActionedByDoctor: failed to load session: ${error.message}`);
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

  // The session must be one of this doctor's accepted patients', and not claimed by a different doctor
  // (same scoping as the queue and the detail view): a doctor cannot Complete or Remove a session
  // they could not see, even if they already knew its id.
  const { data: session, error: lookupError } = await supabase
    .from('intake_sessions')
    .select('id, patient_id, doctor_id')
    .eq('id', sessionId)
    .in('patient_id', patientIds)
    .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`)
    .maybeSingle();

  if (lookupError && lookupError.code !== 'PGRST116') {
    throw new Error(`setIntakeSessionDoctorAction: failed to load session: ${lookupError.message}`);
  }
  if (!session) return null; // not found, or not one of this doctor's accepted-linked patients

  // This doctor's own record of what they did. The queue and the History list are built from it,
  // so it is what makes the action personal to this doctor.
  const { error: auditError } = await supabase.from('intake_session_actions').insert({
    session_id: session.id,
    doctor_id: doctorId,
    patient_id: session.patient_id,
    action,
  });
  if (auditError) {
    throw new Error(`setIntakeSessionDoctorAction: failed to write audit row: ${auditError.message}`);
  }

  // The shared flag on the session row is only for a session that belongs to this doctor alone (one
  // opened through their clinic code). A shared session is never flagged for everyone because one
  // doctor dismissed it.
  if (session.doctor_id === doctorId) {
    const { error: flagError } = await supabase
      .from('intake_sessions')
      .update({ doctor_action: action })
      .eq('id', session.id);
    if (flagError) {
      throw new Error(`setIntakeSessionDoctorAction: failed to update session: ${flagError.message}`);
    }
  }

  const updated = { id: session.id, patient_id: session.patient_id, doctor_action: action };
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
export async function getIntakeActionHistoryForDoctor(doctorId, patientIds = null) {
  if (!doctorId || !supabase) {
    return [];
  }
  // With no patient list, the history is simply everything THIS doctor did:
  // it is the doctor's own record of their actions, so it stays visible after a
  // patient's 24 hour access has ended. (Passing a list still narrows it.)
  if (Array.isArray(patientIds) && patientIds.length === 0) {
    return [];
  }

  let query = supabase
    .from('intake_session_actions')
    .select('id, session_id, patient_id, action, acted_at')
    .eq('doctor_id', doctorId);
  if (Array.isArray(patientIds)) {
    query = query.in('patient_id', patientIds);
  }
  const { data: actions, error: actionsError } = await query.order('acted_at', { ascending: false });

  if (actionsError) {
    throw new Error(`getIntakeActionHistoryForDoctor: failed to load actions: ${actionsError.message}`);
  }
  if (!actions || actions.length === 0) return [];

  const sessionIds = [...new Set(actions.map((a) => a.session_id))];
  const { data: sessions, error: sessionsError } = await supabase
    .from('intake_sessions')
    .select('id, chief_complaint, priority, red_flag_reason, origin, created_at')
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

// Issue #10 fix (audit report): a session left in_progress and never
// returned to used to sit in the doctor's Active Queue and the patient's
// resumable state forever — no cleanup mechanism existed at all. 70 of 104
// sampled sessions were found stuck in_progress live, most well over 24h
// old. Decision (confirmed with the user): mark abandoned rather than
// delete or silently time-filter — the partial clinical data stays on the
// record, an abandoned session can still surface in History, and a patient
// who returns (GET /rag/api/intake/:sessionId, Issue #4's resume path)
// un-abandons it back to in_progress rather than losing progress.
//
// 48h threshold, deliberately longer than the existing 24h doctor-patient
// access-link expiry (db/doctorPatients.js's ACCESS_DURATION_MS) — that one
// is a security boundary (data access), this is advisory queue hygiene, and
// a patient legitimately pausing a multi-part intake over a weekend should
// not have it swept away.
const ABANDON_AFTER_MS = 48 * 60 * 60 * 1000;

/**
 * Sweeps every intake_sessions row that's been in_progress for longer than
 * ABANDON_AFTER_MS and marks it 'abandoned'. Intended to run on a schedule
 * (see backend/routes/intakeAdmin.js's sweep endpoint / scripts/
 * expireAbandonedIntakeSessions.js for a manual/cron-triggered run), not on
 * a per-request path — this is background housekeeping, not something a
 * doctor or patient request should ever wait on.
 *
 * @returns {Promise<{ abandonedCount: number, abandonedIds: string[] }>}
 */
export async function abandonStaleIntakeSessions() {
  if (!supabase) return { abandonedCount: 0, abandonedIds: [] };

  const cutoffIso = new Date(Date.now() - ABANDON_AFTER_MS).toISOString();

  const { data, error } = await supabase
    .from('intake_sessions')
    .update({ status: 'abandoned', abandoned_at: new Date().toISOString() })
    .eq('status', 'in_progress')
    .lt('created_at', cutoffIso)
    .select('id');

  if (error) {
    throw new Error(`abandonStaleIntakeSessions: sweep failed: ${error.message}`);
  }

  const abandonedIds = (data || []).map((r) => r.id);
  return { abandonedCount: abandonedIds.length, abandonedIds };
}

/**
 * Patient names for a list of ids, as { [id]: name }. Used where a screen lists
 * sessions for patients the doctor may no longer have access to (the intake
 * History tab), so the name can't come from an active link.
 */
export async function getPatientNamesByIds(patientIds) {
  const ids = [...new Set((patientIds || []).filter(Boolean))];
  if (ids.length === 0 || !supabase) return {};

  const { data, error } = await supabase.from('patients').select('id, name').in('id', ids);
  if (error) {
    throw new Error(`getPatientNamesByIds: failed to load names: ${error.message}`);
  }
  return Object.fromEntries((data || []).map((row) => [row.id, row.name]));
}
