import crypto from 'crypto';
import supabase from '../config/supabase.js';
import { createNotification } from './notifications.js';
import { listReportActivityForPatients } from './reports.js';
import { ageFromDob } from '../utils/age.js';

// Pushing a notification is best-effort from a linking action's point of
// view — a doctor's request/patient's response must NOT fail just because
// the notifications table had a hiccup. Every call site below awaits this
// but swallows its own error (logged, not thrown) for exactly that reason.
async function notifySafely(args) {
  try {
    await createNotification(args);
  } catch (error) {
    console.warn('doctorPatients notification warning:', error?.message || error);
  }
}

// Doctor -> patient linking is now request-based (status column, added in
// supabase/migrations_archive/20260820051121_add_status_to_doctor_patient.sql):
//   pending   -> doctor requested, patient hasn't responded. No health
//                data is ever returned for a pending link — only
//                { id, patient_name, status } (see minimalDoctorPatientCard).
//   accepted  -> patient approved. Full card + full health record access
//                — but only until access_expires_at (see below).
//   declined  -> patient rejected. Name-only, doctor cannot re-request
//                (linkDoctorToPatient blocks re-linking a declined pair).
//
// SECURITY: isDoctorLinkedToPatient (the gate every other route/service
// uses to decide whether a doctor may read a patient's health data) now
// requires status = 'accepted'. This is enforced here, at the single
// shared source of truth, specifically so it cannot be bypassed by a
// route that forgets to check status separately.
//
// ACCESS EXPIRY (access_expires_at column, added in
// supabase/migrations_archive/20260830010000_add_access_expires_at_to_doctor_patient.sql):
// an 'accepted' link only grants access for ACCESS_DURATION_MS from the
// moment of acceptance — isDoctorLinkedToPatient and getDoctorPatients
// both treat an accepted-but-expired link as if it were no longer
// accepted (surfaced to the frontend as linkStatus 'expired'), and
// linkDoctorToPatient lets the doctor send a fresh request once that
// happens rather than treating the pair as already linked.

// Exported so every code path that moves a link INTO 'accepted' stamps the
// same window from the same constant. Previously module-private, which is
// how the clinic check-in flow (backend/routes/clinic.js's
// upsertAcceptedLink) came to write status='accepted' with NO
// access_expires_at at all: isAccessExpired() reads a null as "no expiry on
// record" and returns false, so a check-in link silently granted PERMANENT
// access while the remote request/accept flow correctly expired after 24h.
export const ACCESS_DURATION_MS = 24 * 60 * 60 * 1000;

/** The expiry instant for a link being accepted right now. */
export function accessExpiryFromNow() {
  return new Date(Date.now() + ACCESS_DURATION_MS).toISOString();
}

// Only ever called for links that are 'accepted'. An accepted link with no
// recorded expiry used to count as "no expiry on record" (never expires), so
// one written without a window — as the clinic check-in flow once did —
// granted permanent access. It now counts as expired: access lasts only while
// a valid, future access_expires_at says so.
// ── Pending requests ──────────────────────────────────────────────────────
// A request waiting for the patient cannot be cancelled by the doctor (cancel
// and re-send was a way to spam a patient with emails). It simply lasts 24
// hours from when it was sent. If the patient hasn't answered by then it has
// expired: the patient can no longer accept or decline it, and the doctor may
// send a new one.
export const PENDING_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

function pendingRequestExpiresAt(link) {
  const sentAt = new Date(link?.requested_at || link?.created_at || 0).getTime();
  return Number.isFinite(sentAt) ? sentAt + PENDING_REQUEST_TTL_MS : 0;
}

function isPendingRequestLive(link) {
  return link?.status === 'pending' && !isPendingRequestExpired(link);
}

function isPendingRequestExpired(link) {
  return link?.status === 'pending' && pendingRequestExpiresAt(link) <= Date.now();
}

// ── Declines ───────────────────────────────────────────────────────────────
// A patient's "no" is counted on the link row (decline_count) and the row is
// kept, so deleting a card can't undo it. Declines come in pairs: after the
// first the doctor may ask once more; the second starts a cooldown during
// which they cannot ask; once it has passed they can ask again, and every two
// further declines start another cooldown. Accepting resets the count.
export const DECLINE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// What a doctor may do about a declined link right now.
function declineRetryState(link) {
  // A decline from before counting existed has decline_count 0 but counts as one.
  const count = Math.max(Number(link?.decline_count) || 0, 1);
  if (count % 2 === 1) {
    return { canRequestAgain: true, retryAt: null, declineCount: count }; // the one extra try
  }
  const until = link?.cooldown_until ? new Date(link.cooldown_until).getTime() : 0;
  if (Number.isFinite(until) && until > Date.now()) {
    return { canRequestAgain: false, retryAt: new Date(until).toISOString(), declineCount: count };
  }
  return { canRequestAgain: true, retryAt: null, declineCount: count }; // cooldown over
}

function formatWait(isoTime) {
  const minutes = Math.max(1, Math.ceil((new Date(isoTime).getTime() - Date.now()) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function declinedCooldownError(link) {
  const retry = declineRetryState(link);
  return retry.canRequestAgain
    ? null
    : new Error(`This patient has declined your request again. You can ask for access again in ${formatWait(retry.retryAt)}.`);
}

function isAccessExpired(link) {
  if (!link?.access_expires_at) return true;
  const expiresAt = new Date(link.access_expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

// "Xm/Xh ago", relative to whenever access actually started (see linkedSince
// below) — access only ever lives for ACCESS_DURATION_MS (24h), so
// minutes/hours is all this ever needs to express. Shown under "Access granted".
function formatLinkedAgo(linkedSince) {
  if (!linkedSince) return 'Recently';
  const diffMs = Date.now() - new Date(linkedSince).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'Recently';

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}hr ago`;
}

// "Access active · 5h left", from the link's real expiry.
function describeAccessLeft(accessExpiresAt) {
  if (!accessExpiresAt) return 'Access active';
  const msLeft = new Date(accessExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(msLeft) || msLeft <= 0) return 'Access active';
  const minutes = Math.ceil(msLeft / (60 * 1000));
  return minutes < 60 ? `Access active · ${minutes}m left` : `Access active · ${Math.ceil(minutes / 60)}h left`;
}

// Best-effort: the chief complaint from this patient's most recent intake
// session (any status — even an abandoned session captured a real stated
// complaint), used as the card's "Condition". Deliberately lenient (returns
// null on any error or when the patient has never gone through intake) — a
// missing condition must not break the patient list, it just falls back to
// a neutral label at the call site.
async function fetchLatestCondition(patientId) {
  if (!patientId || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('intake_sessions')
      .select('chief_complaint, created_at')
      .eq('patient_id', patientId)
      .not('chief_complaint', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    const complaint = data?.chief_complaint ? String(data.chief_complaint).trim() : '';
    return complaint || null;
  } catch (error) {
    console.warn('Latest condition fetch warning:', error?.message || error);
    return null;
  }
}

function normalizeDoctorPatientCard(patient = {}, { condition, linkedSince, accessExpiresAt } = {}) {
  const patientIdValue = patient.patient_code || patient.id;
  const patient_email = patient.patient_email || patient.email || null;
  const patient_name = patient.patient_name || patient.name || patient.fullName || patient_email || 'Patient';
  const patient_phone = patient.patient_phone || patient.phone || patient.mobile || patient.phone_number || null;
  const patient_gender = patient.patient_gender || patient.gender || 'U';
  const patient_dob = patient.patient_dob || patient.dob || patient.date_of_birth || patient.dateOfBirth || null;
  const patient_blood_group = patient.patient_blood_group || patient.blood_group || patient.bloodGroup || patient.blood_type || null;
  const calculatedAge = ageFromDob(patient_dob);

  return {
    id: `#${String(patientIdValue || '').replace(/^#/, '')}` || '#Unknown',
    patientUserId: patient.id,
    patientId: patientIdValue || patient.id,
    patient_email,
    patient_name,
    patient_phone,
    patient_gender,
    patient_dob,
    patient_blood_group,
    name: patient_name,
    email: patient_email,
    phone: patient_phone,
    gender: patient_gender,
    dob: patient_dob,
    blood_group: patient_blood_group,
    age: calculatedAge,
    // The chief complaint from the latest intake, or a plain statement that there is none.
    condition: condition || 'No intake yet',
    conditionTone: condition ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-slate-100 text-slate-500',
    accessGrantedAgo: formatLinkedAgo(linkedSince),
    // The real state of the doctor's access, from the link's expiry.
    status: describeAccessLeft(accessExpiresAt),
    statusTone: 'bg-emerald-100 text-emerald-800',
    // The patient's own photo only; the page draws initials when there is none.
    avatar: patient.picture || null,
  };
}

// Deliberately tiny — no age, phone, dob, blood group, avatar, or anything
// else. A pending/declined/expired card must not leak ANY patient data
// beyond the name, so this is a hardcoded allowlist rather than a filtered
// version of the full object (which would silently start leaking fields if
// someone later adds to normalizeDoctorPatientCard without updating this
// too).
//
// statusOverride lets a caller report a derived status ('expired') that
// differs from the raw link.status ('accepted') still on the row — used
// when an accepted link's access_expires_at has passed but the DB row
// hasn't been touched (expiry is computed live, not written back).
function minimalDoctorPatientCard(link, statusOverride) {
  return {
    linkId: link.id,
    patientUserId: link.patient_id,
    patient_name: link.patient_name || 'Patient',
    linkStatus: statusOverride || link.status, // 'pending' | 'declined' | 'expired' — kept distinct from
    linkedAt: link.created_at, // the unrelated display `status` field above
    accessExpiresAt: link.access_expires_at || null,
    // Only meaningful on a declined card: whether the doctor may ask again, and if
    // not, when. (An expired card can always be re-requested.)
    ...(link.status === 'declined' && !statusOverride ? declineRetryState(link) : {}),
    // Only meaningful on a pending card: when the request lapses if the patient
    // doesn't answer, and whether it already has (then the doctor may ask again).
    ...(link.status === 'pending' && !statusOverride
      ? {
          requestExpiresAt: new Date(pendingRequestExpiresAt(link)).toISOString(),
          requestExpired: isPendingRequestExpired(link),
        }
      : {}),
  };
}

export const getDoctorPatients = async (doctorId) => {
  if (!doctorId || !supabase) {
    return [];
  }

  try {
    const { data: links, error } = await supabase
      .from('doctor_patient')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('hidden_by_doctor', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!Array.isArray(links) || links.length === 0) {
      return [];
    }

    const patientRecords = await Promise.all(
      links.map(async (link) => {
        const patientId = link.patient_id || link.patientId || link.user_id || link.userId;
        if (!patientId) {
          return null;
        }

        // Pending/declined: return the minimal shape and STOP — no query
        // against `patients` at all, so no health-adjacent data (dob,
        // blood group, etc.) is ever fetched for a link the patient
        // hasn't accepted.
        if (link.status !== 'accepted') {
          return minimalDoctorPatientCard(link);
        }

        // Accepted but the 24h access window has lapsed: same treatment as
        // pending/declined — minimal, name-only card, no `patients` lookup.
        // Surfaced as linkStatus 'expired' (not 'accepted') so the frontend
        // renders it as inactive rather than as a full patient card.
        if (isAccessExpired(link)) {
          return minimalDoctorPatientCard(link, 'expired');
        }

        // Post-split: doctor_patient.patient_id always points at `patients`
        // (see db-code-crossref.md — verified patient_id resolves only to
        // patient-role rows even before the split), so this looks up
        // `patients` directly rather than the old shared `users` table.
        const { data: patient, error: patientError } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .maybeSingle();

        if (patientError && patientError.code !== 'PGRST116') {
          throw patientError;
        }

        if (!patient) {
          return null;
        }

        const condition = await fetchLatestCondition(patientId);

        const normalizedPatient = normalizeDoctorPatientCard(
          {
            ...patient,
            patient_email: link.patient_email || patient.email || null,
            patient_name: link.patient_name || patient.name || patient.fullName || patient.email || 'Patient',
            patient_phone: link.patient_phone || patient.phone || patient.mobile || patient.phone_number || null,
            patient_gender: link.patient_gender || patient.gender || 'U',
            patient_dob: link.patient_dob || patient.dob || patient.date_of_birth || patient.dateOfBirth || null,
            patient_blood_group: link.patient_blood_group || patient.blood_group || patient.bloodGroup || patient.blood_type || null,
          },
          { condition, linkedSince: link.responded_at || link.created_at, accessExpiresAt: link.access_expires_at }
        );

        return {
          ...normalizedPatient,
          linkId: link.id,
          linkedAt: link.created_at,
          linkStatus: link.status,
        };
      })
    );

    return patientRecords.filter(Boolean);
  } catch (error) {
    console.warn('Doctor patient fetch warning:', error?.message || error);
    return [];
  }
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dashboard stats for a doctor, computed server-side so they cover every
 * patient who ever accepted this doctor's link, including ones whose 24h
 * access window has since lapsed. Counts only — no patient or report
 * content is returned, so this doesn't need the access-window gate
 * getDoctorPatients / isDoctorLinkedToPatient apply.
 *
 * "Reports logged" is the doctor's intake History (the sessions they've
 * marked Completed or Removed — intake_session_actions, one per session,
 * dated by the latest action), not the reports patients upload: those
 * aren't tied to any doctor, so counting them credited this doctor with
 * other clinicians' records. Prescriptions are the exception — there's no
 * intake equivalent, so they still come from uploaded reports.
 */
export const getDoctorLifetimeStats = async (doctorId) => {
  const empty = {
    totalPatients: 0,
    totalReports: 0,
    reportsThisWeek: 0,
    reportsPrevWeek: 0,
    newPatientsThisWeek: 0,
    prescriptionsThisWeek: 0,
  };
  if (!doctorId || !supabase) return empty;

  const { data: links, error } = await supabase
    .from('doctor_patient')
    .select('patient_id, created_at, responded_at')
    .eq('doctor_id', doctorId)
    .eq('status', 'accepted');

  if (error) {
    throw error;
  }

  const patientIds = [...new Set((links || []).map((l) => l.patient_id).filter(Boolean))];
  if (patientIds.length === 0) return empty;

  const [reportRows, actionsResult] = await Promise.all([
    listReportActivityForPatients(patientIds),
    supabase
      .from('intake_session_actions')
      .select('session_id, acted_at')
      .eq('doctor_id', doctorId)
      .in('patient_id', patientIds),
  ]);

  if (actionsResult.error) {
    throw actionsResult.error;
  }

  // One entry per session (a session can be actioned more than once), dated
  // by its latest action — same rule the History list uses.
  const latestActionBySession = new Map();
  for (const a of actionsResult.data || []) {
    const prev = latestActionBySession.get(a.session_id);
    if (!prev || new Date(a.acted_at) > new Date(prev)) {
      latestActionBySession.set(a.session_id, a.acted_at);
    }
  }
  const historyDates = [...latestActionBySession.values()];

  const now = Date.now();
  const weekStart = now - WEEK_MS;
  const prevWeekStart = now - 2 * WEEK_MS;
  const inThisWeek = (at) => at != null && new Date(at).getTime() >= weekStart;
  const inPrevWeek = (at) => {
    if (at == null) return false;
    const t = new Date(at).getTime();
    return t >= prevWeekStart && t < weekStart;
  };

  return {
    totalPatients: patientIds.length,
    totalReports: historyDates.length,
    reportsThisWeek: historyDates.filter(inThisWeek).length,
    reportsPrevWeek: historyDates.filter(inPrevWeek).length,
    // responded_at is when the patient accepted — and a clinic check-in
    // re-stamps it on an already-linked pair — so it tracks "linked" better
    // than created_at (the original request time).
    newPatientsThisWeek: (links || []).filter((l) => inThisWeek(l.responded_at || l.created_at)).length,
    prescriptionsThisWeek: reportRows.filter(
      (r) => (r.category === 'Prescription' || r.category === 'Prescriptions') && inThisWeek(r.at)
    ).length,
  };
};

/**
 * The authorization gate every other route/service uses before returning a
 * patient's health data to a doctor. Requires status = 'accepted' AND an
 * unexpired access_expires_at — a pending, declined, or expired link
 * returns false, same as no link at all. This is the single place that
 * decision is made; callers must not re-derive it from a raw
 * link-exists/status check.
 */
export const isDoctorLinkedToPatient = async (doctorId, patientUserId) => {
  if (!doctorId || !patientUserId || !supabase) {
    return false;
  }

  const { data, error } = await supabase
    .from('doctor_patient')
    .select('id, access_expires_at')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientUserId)
    .eq('status', 'accepted')
    .maybeSingle();

  // PGRST116 ("no row found") is not an error condition here — it's the
  // ordinary "not linked" case. Anything else (a real DB/network failure)
  // is deliberately let through to the caller rather than swallowed into a
  // silent `false`: callers that need to tell "not linked" (403) apart from
  // "couldn't check" (500) rely on this throwing. Every current caller
  // already awaits this inside its own try/catch (see call sites in
  // backend/routes/reports.js and backend/routes/doctorPatients.js).
  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (!data) return false;
  return !isAccessExpired(data);
};

/**
 * Creates a PENDING link request. Does not grant any data access — the
 * patient must accept via acceptDoctorLinkRequest before
 * isDoctorLinkedToPatient (and therefore any health-data route) returns
 * true for this pair.
 */
export const linkDoctorToPatient = async ({ doctorId, patientCode }) => {
  if (!doctorId || !patientCode) {
    throw new Error('Doctor ID and patient code are required.');
  }

  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  const normalizedPatientCode = String(patientCode).trim();
  if (!normalizedPatientCode) {
    throw new Error('Patient code is required.');
  }

  let patient = null;

  try {
    // Only allow lookup by patient_code. Reject direct user ID lookups to
    // ensure linking is only possible via patient codes provided to patients.
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('patient_code', normalizedPatientCode)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    patient = data;
  } catch (error) {
    console.warn('Doctor patient lookup warning:', error?.message || error);
    throw new Error('Unable to verify the patient code at the moment.');
  }

  if (!patient) {
    throw new Error('No patient found with this code.');
  }

  const { data: existingLink, error: existingLinkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patient.id)
    .maybeSingle();

  if (existingLinkError && existingLinkError.code !== 'PGRST116') {
    throw existingLinkError;
  }

  if (existingLink) {
    if (existingLink.status === 'declined') {
      // The patient said no. After a first decline the doctor may ask once
      // more; after a second there is a cooldown (see declineRetryState).
      const blocked = declinedCooldownError(existingLink);
      if (blocked) throw blocked;
      return reopenExpiredLink({ doctorId, patient, existingLink });
    }

    const expired =
      (existingLink.status === 'accepted' && isAccessExpired(existingLink))
      || isPendingRequestExpired(existingLink); // the patient never answered

    if (!expired) {
      // pending, or still within its 24h access window — idempotent,
      // return the existing link as-is.
      return {
        // No email token: nothing new is being sent. (The stored token used to
        // ride along here, which made the route re-send the patient's email on
        // every repeat of the same code.)
        link: { ...existingLink, email_action_token: null },
        patient: existingLink.status === 'accepted' ? normalizeDoctorPatientCard(patient) : minimalDoctorPatientCard(existingLink),
        isNewRequest: false,
      };
    }

    // Access lapsed — re-open the SAME row as a fresh pending request
    // rather than inserting a second one (doctor_patient_unique constrains
    // one row per doctor/patient pair).
    return reopenExpiredLink({ doctorId, patient, existingLink });
  }

  // One-shot token for the "Accept" / "Decline" links in the request email
  // (see backend/utils/mailer.js sendDoctorRequestEmail and the
  // /email-action/* routes in backend/routes/doctorPatients.js). Cleared
  // the moment the request is resolved by EITHER channel, so a reused or
  // stale email link fails safely instead of silently re-applying.
  const emailActionToken = crypto.randomBytes(20).toString('hex');

  const payload = {
    doctor_id: doctorId,
    patient_id: patient.id,
    patient_email: patient.email || null,
    patient_name: patient.name || patient.fullName || patient.email || 'Patient',
    patient_phone: patient.phone || patient.mobile || patient.phone_number || null,
    patient_gender: patient.gender || 'U',
    patient_dob: patient.dob || patient.date_of_birth || patient.dateOfBirth || null,
    patient_blood_group: patient.blood_group || patient.bloodGroup || patient.blood_type || null,
    status: 'pending', // explicit — not relying on the column default alone
    created_at: new Date().toISOString(),
    requested_at: new Date().toISOString(),
    email_action_token: emailActionToken,
  };

  const { data, error } = await supabase
    .from('doctor_patient')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await notifyPatientOfNewRequest({ doctorId, patient, link: data });

  return {
    isNewRequest: true,
    link: data,
    // Pending: return the minimal shape, not the full patient object —
    // the requesting doctor doesn't get health data just by sending a
    // request, only once (if) the patient accepts.
    patient: minimalDoctorPatientCard(data),
  };
};

// Re-opens an existing (accepted-but-expired) doctor_patient row as a fresh
// pending request — refreshes the denormalized patient snapshot fields in
// case they changed since the original request, and issues a new
// email_action_token/notification exactly like a brand-new request would.
// Shared by linkDoctorToPatient (re-requesting by patient code) and
// requestAccessAgain (re-requesting straight from an expired card, by
// patient id, no code re-entry needed).
async function reopenExpiredLink({ doctorId, patient, existingLink }) {
  const emailActionToken = crypto.randomBytes(20).toString('hex');
  const { data: reopened, error: reopenError } = await supabase
    .from('doctor_patient')
    .update({
      status: 'pending',
      patient_email: patient.email || null,
      patient_name: patient.name || patient.fullName || patient.email || 'Patient',
      patient_phone: patient.phone || patient.mobile || patient.phone_number || null,
      patient_gender: patient.gender || 'U',
      patient_dob: patient.dob || patient.date_of_birth || patient.dateOfBirth || null,
      patient_blood_group: patient.blood_group || patient.bloodGroup || patient.blood_type || null,
      responded_at: null,
      access_expires_at: null,
      email_action_token: emailActionToken,
      hidden_by_doctor: false,
      cooldown_until: null,
      requested_at: new Date().toISOString(),
      // A link being reopened after a decline has already had one: make sure a
      // row declined before decline_count existed carries that into the count.
      ...(existingLink.status === 'declined'
        ? { decline_count: Math.max(Number(existingLink.decline_count) || 0, 1) }
        : {}),
    })
    .eq('id', existingLink.id)
    .select()
    .single();

  if (reopenError) throw reopenError;

  await notifyPatientOfNewRequest({ doctorId, patient, link: reopened });

  return {
    isNewRequest: true,
    link: reopened,
    patient: minimalDoctorPatientCard(reopened),
  };
}

/**
 * Re-requests access straight from an expired card — no patient code
 * re-entry needed, since the doctor is already linked to (and knows) this
 * patient. Only valid when the existing link is 'accepted' and its access
 * has actually expired; anything else is rejected so this can't be used to
 * bypass the normal pending->accept flow or re-request a declined pair.
 */
export const requestAccessAgain = async ({ doctorId, patientUserId }) => {
  if (!doctorId || !patientUserId) {
    throw new Error('Doctor ID and patient ID are required.');
  }
  if (!supabase) throw new Error('Database connection is unavailable.');

  const { data: existingLink, error: existingLinkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientUserId)
    .maybeSingle();

  if (existingLinkError && existingLinkError.code !== 'PGRST116') throw existingLinkError;
  if (!existingLink) {
    throw new Error('No previous request found for this patient.');
  }
  if (existingLink.status === 'declined') {
    const blocked = declinedCooldownError(existingLink);
    if (blocked) throw blocked;
  } else if (existingLink.status === 'pending') {
    if (!isPendingRequestExpired(existingLink)) {
      throw new Error(`Your request is still waiting for the patient. You can send a new one if they haven't responded in ${formatWait(new Date(pendingRequestExpiresAt(existingLink)).toISOString())}.`);
    }
  } else if (existingLink.status !== 'accepted' || !isAccessExpired(existingLink)) {
    throw new Error('This request is not eligible to be re-sent.');
  }

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientUserId)
    .maybeSingle();

  if (patientError && patientError.code !== 'PGRST116') throw patientError;
  if (!patient) {
    throw new Error('Patient not found.');
  }

  return reopenExpiredLink({ doctorId, patient, existingLink });
};

// Shared by both the brand-new-request path and the re-open-after-expiry
// path above — this is the ONLY place a doctor's access request becomes
// visible to the patient (there is no separate "Doctor Requests" page
// anymore; it lives entirely in the notification bell). metadata.linkId is
// what lets the bell render Accept/Decline buttons directly on this
// notification and call the right endpoint.
async function notifyPatientOfNewRequest({ doctorId, patient, link }) {
  const { data: doctor } = await supabase
    .from('doctors')
    .select('name')
    .eq('id', doctorId)
    .maybeSingle();
  const doctorName = doctor?.name || 'A doctor';
  await notifySafely({
    recipientId: patient.id,
    actorId: doctorId,
    actorRole: 'doctor',
    eventType: 'doctor_request',
    title: 'New doctor access request',
    message: `Dr. ${doctorName} requested access to your health records.`,
    metadata: { linkId: link.id, doctorName },
  });
}

/**
 * Notification feed for a PATIENT's bell icon: one event per doctor_patient
 * row for "a doctor requested access" (created_at), plus a second event
 * for "you accepted/declined" if responded_at is set. Sorted newest first.
 * type is one of 'request' | 'accepted' | 'declined' so the frontend can
 * render each distinctly without re-deriving it from status.
 */
export const getPatientNotifications = async (patientUserId) => {
  if (!patientUserId || !supabase) return [];

  try {
    const { data: links, error } = await supabase
      .from('doctor_patient')
      .select('*')
      .eq('patient_id', patientUserId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(links) || links.length === 0) return [];

    const doctorIds = [...new Set(links.map((l) => l.doctor_id).filter(Boolean))];
    const { data: doctors, error: doctorsError } = await supabase
      .from('doctors')
      .select('id, name')
      .in('id', doctorIds);

    if (doctorsError) throw doctorsError;
    const doctorNameById = new Map((doctors || []).map((d) => [d.id, d.name || 'Unknown Doctor']));

    const notifications = [];
    for (const link of links) {
      // A request the patient never answered has lapsed: it must not keep
      // showing Accept / Decline buttons.
      if (isPendingRequestExpired(link)) continue;
      const doctorName = doctorNameById.get(link.doctor_id) || 'Unknown Doctor';

      notifications.push({
        id: `${link.id}-request`,
        linkId: link.id,
        type: 'request',
        doctorName,
        at: link.created_at,
      });

      if (link.responded_at && (link.status === 'accepted' || link.status === 'declined')) {
        notifications.push({
          id: `${link.id}-${link.status}`,
          linkId: link.id,
          type: link.status, // 'accepted' | 'declined'
          doctorName,
          at: link.responded_at,
        });
      }
    }

    notifications.sort((a, b) => new Date(b.at) - new Date(a.at));
    return notifications;
  } catch (error) {
    console.warn('Patient notifications fetch warning:', error?.message || error);
    return [];
  }
};

/**
 * Notification feed for a DOCTOR's bell icon: one event per doctor_patient
 * row for "you sent a request" (created_at), plus a second event for "the
 * patient accepted/declined" if responded_at is set. Same shape as
 * getPatientNotifications but from the doctor's side.
 */
export const getDoctorNotifications = async (doctorId) => {
  if (!doctorId || !supabase) return [];

  try {
    const { data: links, error } = await supabase
      .from('doctor_patient')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(links) || links.length === 0) return [];

    const notifications = [];
    for (const link of links) {
      const patientName = link.patient_name || 'Patient';

      notifications.push({
        id: `${link.id}-request`,
        linkId: link.id,
        type: 'request-sent',
        patientName,
        at: link.created_at,
      });

      if (link.responded_at && (link.status === 'accepted' || link.status === 'declined')) {
        notifications.push({
          id: `${link.id}-${link.status}`,
          linkId: link.id,
          // 'patient-accepted' | 'patient-declined' — distinct from the
          // patient-side 'accepted'/'declined' types so a shared bell
          // component can tell which side it's rendering for from the
          // type alone.
          type: `patient-${link.status}`,
          patientName,
          at: link.responded_at,
        });
      }
    }

    notifications.sort((a, b) => new Date(b.at) - new Date(a.at));
    return notifications;
  } catch (error) {
    console.warn('Doctor notifications fetch warning:', error?.message || error);
    return [];
  }
};

// Shared core for resolving a pending request, regardless of which channel
// (in-app bell or the email Accept/Decline link) triggered it. Both
// channels ultimately race to flip the SAME row's status from 'pending' to
// 'accepted'/'declined', guarded by the `.eq('status', 'pending')` in the
// update below — whichever channel gets there first wins, and the loser
// gets a clean "already accepted/declined" error rather than silently
// double-applying. email_action_token is cleared on resolution so a
// reused/stale email link can no longer act on this row either.
async function resolveDoctorLinkRequest({ link, newStatus, resolvedByRole, resolvedByUserId }) {
  if (isPendingRequestExpired(link)) {
    throw new Error('This request has expired. The doctor can send a new one.');
  }
  const updatePayload = { status: newStatus, responded_at: new Date().toISOString(), email_action_token: null };
  if (newStatus === 'accepted') {
    // Access is time-boxed from the moment of acceptance, not permanent —
    // see the ACCESS EXPIRY note above this file's status-column comment.
    updatePayload.access_expires_at = accessExpiryFromNow();
    // Accepting wipes the slate: no decline history, no cooldown.
    updatePayload.decline_count = 0;
    updatePayload.cooldown_until = null;
    updatePayload.hidden_by_doctor = false;
  } else if (newStatus === 'declined') {
    // Count it. Every second decline starts a cooldown (declineRetryState).
    const declines = Math.max(Number(link.decline_count) || 0, 0) + 1;
    updatePayload.decline_count = declines;
    updatePayload.cooldown_until = declines % 2 === 0 ? new Date(Date.now() + DECLINE_COOLDOWN_MS).toISOString() : null;
  }

  const { data, error } = await supabase
    .from('doctor_patient')
    .update(updatePayload)
    .eq('id', link.id)
    .eq('status', 'pending') // re-check at write time, not just at the read above — closes the race window between the two.
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No row matched id+status='pending' — someone else (the other
      // channel) already resolved it between our read and this write.
      throw new Error('This request has already been responded to.');
    }
    throw error;
  }

  const eventType = newStatus === 'accepted' ? 'doctor_request_accepted' : 'doctor_request_declined';
  const verb = newStatus === 'accepted' ? 'accepted' : 'declined';
  const message =
    newStatus === 'accepted'
      ? `${data.patient_name || 'A patient'} accepted your access request. You have access to their records for the next 24 hours.`
      : `${data.patient_name || 'A patient'} declined your access request.`;
  await notifySafely({
    recipientId: data.doctor_id,
    actorId: resolvedByUserId,
    actorRole: resolvedByRole,
    eventType,
    title: `Request ${verb}`,
    message,
    metadata: { linkId: data.id },
  });

  return data;
}

/**
 * Patient accepts a pending request. Only the patient the link belongs to
 * may accept it — patientUserId must match the link's patient_id, checked
 * server-side, not trusted from the request body/params alone.
 */
export const acceptDoctorLinkRequest = async ({ patientUserId, linkId }) => {
  if (!patientUserId || !linkId) {
    throw new Error('Patient ID and link ID are required.');
  }
  if (!supabase) throw new Error('Database connection is unavailable.');

  const { data: link, error: linkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('id', linkId)
    .maybeSingle();

  if (linkError && linkError.code !== 'PGRST116') throw linkError;
  if (!link) throw new Error('Request not found.');
  if (link.patient_id !== patientUserId) {
    throw new Error('This request does not belong to you.');
  }
  if (link.status !== 'pending') {
    throw new Error(`This request is already ${link.status}.`);
  }

  return resolveDoctorLinkRequest({ link, newStatus: 'accepted', resolvedByRole: 'patient', resolvedByUserId: patientUserId });
};

/**
 * Patient declines a pending request. Same ownership check as accept.
 * A declined link is NOT deleted — kept as a record, with
 * linkDoctorToPatient refusing to re-create a link for a declined pair.
 */
export const declineDoctorLinkRequest = async ({ patientUserId, linkId }) => {
  if (!patientUserId || !linkId) {
    throw new Error('Patient ID and link ID are required.');
  }
  if (!supabase) throw new Error('Database connection is unavailable.');

  const { data: link, error: linkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('id', linkId)
    .maybeSingle();

  if (linkError && linkError.code !== 'PGRST116') throw linkError;
  if (!link) throw new Error('Request not found.');
  if (link.patient_id !== patientUserId) {
    throw new Error('This request does not belong to you.');
  }
  if (link.status !== 'pending') {
    throw new Error(`This request is already ${link.status}.`);
  }

  return resolveDoctorLinkRequest({ link, newStatus: 'declined', resolvedByRole: 'patient', resolvedByUserId: patientUserId });
};

/**
 * Resolve a pending request via the token from the email Accept/Decline
 * link — no login required, so ownership is proven by possession of the
 * token itself (mailed only to the patient's own registered address)
 * rather than a JWT. Same shared resolveDoctorLinkRequest core as the
 * in-app accept/decline, so the race-safety and notification behavior are
 * identical regardless of channel.
 */
export const resolveDoctorLinkRequestByToken = async (emailActionToken, newStatus) => {
  if (!emailActionToken) throw new Error('Missing action token.');
  if (!supabase) throw new Error('Database connection is unavailable.');

  const { data: link, error: linkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('email_action_token', emailActionToken)
    .maybeSingle();

  if (linkError && linkError.code !== 'PGRST116') throw linkError;
  if (!link) throw new Error('This link is invalid or has already been used.');
  if (link.status !== 'pending') throw new Error(`This request is already ${link.status}.`);

  return resolveDoctorLinkRequest({ link, newStatus, resolvedByRole: 'patient', resolvedByUserId: link.patient_id });
};

/**
 * Cross-channel sync for the notification bell: a 'doctor_request'
 * notification row never changes after it's created (accept/decline
 * creates a SEPARATE notification for the doctor, see
 * resolveDoctorLinkRequest above) — so on its own, the bell has no way to
 * know a request shown as "pending" was actually already resolved via the
 * OTHER channel (the email Accept/Decline link). This looks up the real,
 * current status for a batch of linkIds in one query, so the caller
 * (backend/routes/notifications.js) can stamp live status onto each
 * notification's metadata before sending it to the frontend — the bell
 * then hides Accept/Decline the moment status stops being 'pending',
 * regardless of which channel resolved it.
 */
export const getDoctorLinkStatuses = async (linkIds) => {
  const ids = [...new Set((linkIds || []).filter(Boolean))];
  if (ids.length === 0 || !supabase) return {};

  try {
    const { data, error } = await supabase
      .from('doctor_patient')
      .select('id, status')
      .in('id', ids);

    if (error) throw error;
    return Object.fromEntries((data || []).map((row) => [row.id, row.status]));
  } catch (error) {
    console.warn('Doctor link status lookup warning:', error?.message || error);
    return {};
  }
};

export const deleteDoctorPatient = async ({ doctorId, patientUserId, linkId }) => {
  if (!doctorId) {
    throw new Error('Doctor ID is required.');
  }

  if (!linkId && !patientUserId) {
    throw new Error('Either link ID or patient user ID is required.');
  }

  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  try {
    let lookup = supabase
      .from('doctor_patient')
      .select('id, status, decline_count, requested_at, created_at')
      .eq('doctor_id', doctorId);
    lookup = linkId ? lookup.eq('id', linkId) : lookup.eq('patient_id', patientUserId);
    const { data: link, error: lookupError } = await lookup.maybeSingle();
    if (lookupError && lookupError.code !== 'PGRST116') throw lookupError;

    if (!link) {
      return { message: 'Patient removed successfully.' };
    }

    // A request the patient still has time to answer can't be cancelled: cancel
    // and re-send was a way to flood a patient with requests. It lapses by
    // itself after 24 hours, and then it can be removed or sent again.
    if (isPendingRequestLive(link)) {
      throw new Error("A request can't be cancelled while the patient can still respond. If they don't respond within 24 hours you can send a new one.");
    }

    // A link with decline history is never deleted: the history is what stops
    // the doctor from asking again at once, and deleting the row would erase
    // it. Removing the card just hides it. A request still waiting for the
    // patient is closed so its email link can no longer be used.
    if (link.status === 'declined' || Number(link.decline_count) > 0) {
      const { error: hideError } = await supabase
        .from('doctor_patient')
        .update({
          hidden_by_doctor: true,
          ...(link.status === 'pending' ? { status: 'declined', email_action_token: null } : {}),
        })
        .eq('id', link.id)
        .eq('doctor_id', doctorId);
      if (hideError) throw hideError;
      return { message: 'Patient removed successfully.' };
    }

    const { error } = await supabase
      .from('doctor_patient')
      .delete()
      .eq('id', link.id)
      .eq('doctor_id', doctorId);
    if (error) throw error;

    return { message: 'Patient removed successfully.' };
  } catch (error) {
    console.error('Delete doctor patient error:', error);
    throw error;
  }
};

/**
 * PATIENT-facing: the doctors who can see this patient's records right now
 * (accepted links whose access window hasn't ended), with enough about each
 * doctor for the patient to recognise them.
 */
export const getActiveDoctorAccessForPatient = async (patientId) => {
  if (!patientId || !supabase) return [];

  const { data: links, error } = await supabase
    .from('doctor_patient')
    .select('id, doctor_id, access_expires_at, created_at')
    .eq('patient_id', patientId)
    .eq('status', 'accepted');
  if (error) throw error;

  const active = (links || []).filter((link) => !isAccessExpired(link));
  if (active.length === 0) return [];

  const { data: doctors, error: doctorsError } = await supabase
    .from('doctors')
    .select('id, name, specialty, hospital_name')
    .in('id', active.map((link) => link.doctor_id));
  if (doctorsError) throw doctorsError;
  const doctorById = new Map((doctors || []).map((doctor) => [doctor.id, doctor]));

  return active
    .map((link) => {
      const doctor = doctorById.get(link.doctor_id) || {};
      return {
        linkId: link.id,
        doctorName: doctor.name || 'Doctor',
        specialty: doctor.specialty || null,
        hospitalName: doctor.hospital_name || null,
        accessExpiresAt: link.access_expires_at,
      };
    })
    .sort((a, b) => new Date(a.accessExpiresAt) - new Date(b.accessExpiresAt));
};

/**
 * PATIENT-facing: ends a doctor's access immediately, instead of waiting out
 * the 24 hours. Access already lasts only while access_expires_at is in the
 * future, so revoking just moves that moment into the past: every place that
 * checks access (records, summaries, intake, Ask Swastha) stops allowing the
 * doctor at once, with no new status value or schema change. The doctor then
 * sees the link as expired and can only get access back by sending a new
 * request, which the patient is free to decline.
 *
 * Scoped to the patient: a link that isn't theirs (or isn't accepted) matches
 * nothing and returns null.
 */
export const revokeDoctorAccess = async ({ linkId, patientId }) => {
  if (!linkId || !patientId || !supabase) return null;

  const { data, error } = await supabase
    .from('doctor_patient')
    .update({ access_expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', linkId)
    .eq('patient_id', patientId)
    .eq('status', 'accepted')
    .select('id, doctor_id')
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
};
