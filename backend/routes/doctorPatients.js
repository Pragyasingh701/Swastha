import express from 'express';
import jwt from 'jsonwebtoken';
import {
  getDoctorPatients,
  linkDoctorToPatient,
  deleteDoctorPatient,
  getPendingRequestsForPatient,
  acceptDoctorLinkRequest,
  declineDoctorLinkRequest,
  resolveDoctorLinkRequestByToken,
  isDoctorLinkedToPatient,
  getDoctorNotifications,
  getPatientNotifications,
} from '../db/doctorPatients.js';
import { createNotification } from '../db/notifications.js';
import { sendDoctorRequestEmail } from '../utils/mailer.js';
import { listTimelineReports } from '../db/reports.js';
import {
  getIntakeQueueForPatients,
  getIntakeSessionForPatients,
  setIntakeSessionDoctorAction,
  getIntakeActionHistoryForDoctor,
} from '../db/intakeSessions.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';
// RAG used to be a separate service/process (RAG_BASE_URL pointed at its
// own port); it's now mounted in-process at /rag (see server.js), so this
// defaults to a loopback call on this same server instead of a second
// service. RAG_BASE_URL is still overridable for anyone still running it
// standalone.
const RAG_BASE_URL = process.env.RAG_BASE_URL || `http://localhost:${process.env.PORT || 5001}/rag/api`;

function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const patients = await getDoctorPatients(authUser.userId);
    return res.json({ patients });
  } catch (error) {
    console.error('Doctor patient list error:', error);
    return res.status(500).json({ message: 'Unable to load doctor patients.' });
  }
});

/**
 * GET /api/doctor-patients/notifications
 * Bell-icon feed for BOTH sides — dispatches on the caller's own role
 * (from the verified JWT, not a query param) so a doctor always gets
 * getDoctorNotifications and a patient always gets getPatientNotifications;
 * there is no way to ask for the other side's feed by changing a param.
 * Each entry has { id, linkId, type, at, doctorName|patientName }.
 *
 * Declared before any '/:param' route so Express doesn't match
 * "notifications" as a :patientId.
 */
router.get('/notifications', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const notifications =
      authUser.role === 'doctor'
        ? await getDoctorNotifications(authUser.userId)
        : await getPatientNotifications(authUser.userId);
    return res.json({ notifications });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    return res.status(500).json({ message: 'Unable to load notifications.' });
  }
});

/**
 * GET /api/doctor-patients/pending-requests
 * PATIENT-facing: lists doctor link requests awaiting this patient's
 * response. Scoped to req.user — a patient can only ever see their own
 * pending requests.
 *
 * Declared before any '/:param' route so Express doesn't match
 * "pending-requests" as a :patientId.
 */
router.get('/pending-requests', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const requests = await getPendingRequestsForPatient(authUser.userId);
    return res.json({ requests });
  } catch (error) {
    console.error('Pending requests list error:', error);
    return res.status(500).json({ message: 'Unable to load doctor requests.' });
  }
});

/**
 * GET /api/doctor-patients/intake-queue
 * DOCTOR-facing. Module A (Conversational History Engine), Phase 3 — PRD
 * §6.2/§8. Deviates from the PRD's literal path (/rag/api/intake/queue):
 * this is a plain priority-sorted read with no AI/generation step, so it
 * follows the SAME pattern as /:patientId/summary below — the 'accepted'
 * doctor_patient link gate (via getDoctorPatients) happens here, in the
 * main backend, not in rag/ (which is only reached for actual generation
 * work). Confirmed with the user.
 *
 * Returns sessions for EVERY status (in_progress + completed), across all
 * of the caller-doctor's accepted-linked patients, sorted priority desc
 * (flagged first) then created_at asc — same sort PRD §6.2 specifies.
 *
 * Declared before any '/:param' route so Express doesn't match
 * "intake-queue" as a :patientId.
 */
router.get('/intake-queue', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    // getDoctorPatients already returns only 'accepted' links with full
    // patient data attached (minimalDoctorPatientCard stops short of that
    // for pending/declined) — reused here rather than re-querying
    // doctor_patient directly, same as /:patientId/summary below.
    const patients = await getDoctorPatients(authUser.userId);
    const accepted = patients.filter((p) => p.linkStatus === 'accepted');

    if (accepted.length === 0) {
      return res.json({ sessions: [] });
    }

    const patientById = new Map(accepted.map((p) => [p.patientUserId, p]));
    const sessions = await getIntakeQueueForPatients([...patientById.keys()], authUser.userId);

    return res.json({
      sessions: sessions.map((s) => ({
        session_id: s.id,
        patient_id: s.patient_id,
        patient_name: patientById.get(s.patient_id)?.name || 'Patient',
        chief_complaint: s.chief_complaint,
        priority: s.priority,
        red_flag_reason: s.red_flag_reason,
        status: s.status,
        origin: s.origin,
        intake_method: s.intake_method,
        doctor_action: s.doctor_action,
        created_at: s.created_at,
        completed_at: s.completed_at,
      })),
    });
  } catch (error) {
    console.error('Intake queue fetch error:', error);
    return res.status(500).json({ message: 'Unable to load intake queue.' });
  }
});

/**
 * GET /api/doctor-patients/intake-queue/history
 * DOCTOR-facing. Every session the caller-doctor has marked Completed or
 * Removed from the live queue, newest action first — the audit trail for
 * both actions (PRD ask: "keep a history of which he has completed and
 * also which he has removed"). Same 'accepted' link gate as the queue list
 * above.
 *
 * Declared BEFORE '/intake-queue/:sessionId' so Express matches "history"
 * here rather than treating it as a :sessionId.
 */
router.get('/intake-queue/history', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const patients = await getDoctorPatients(authUser.userId);
    const accepted = patients.filter((p) => p.linkStatus === 'accepted');

    if (accepted.length === 0) {
      return res.json({ history: [] });
    }

    const patientById = new Map(accepted.map((p) => [p.patientUserId, p]));
    const history = await getIntakeActionHistoryForDoctor(authUser.userId, [...patientById.keys()]);

    return res.json({
      history: history.map((h) => ({
        session_id: h.session_id,
        patient_id: h.patient_id,
        patient_name: patientById.get(h.patient_id)?.name || 'Patient',
        chief_complaint: h.chief_complaint,
        priority: h.priority,
        red_flag_reason: h.red_flag_reason,
        origin: h.origin,
        intake_method: h.intake_method,
        action: h.action,
        acted_at: h.acted_at,
        created_at: h.created_at,
      })),
    });
  } catch (error) {
    console.error('Intake queue history fetch error:', error);
    return res.status(500).json({ message: 'Unable to load intake queue history.' });
  }
});

/**
 * GET /api/doctor-patients/intake-queue/:sessionId
 * DOCTOR-facing. Full detail for one intake session — the structured
 * SOCRATES/drug-allergy summary a doctor sees after clicking a queue row.
 * Same 'accepted' link gate as the queue list above: a session only
 * resolves if its patient_id belongs to one of the caller-doctor's
 * accepted-linked patients, otherwise 404 (not 403 — doesn't confirm or
 * deny whether the session id exists at all to an unauthorized caller).
 *
 * Declared before any other '/:param' route so Express doesn't match
 * "intake-queue" as a :patientId, and before '/requests/:linkId/...' so the
 * two nested-param routes don't collide.
 */
router.get('/intake-queue/:sessionId', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const sessionId = String(req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    return res.status(400).json({ message: 'Session ID is required.' });
  }

  try {
    const patients = await getDoctorPatients(authUser.userId);
    const accepted = patients.filter((p) => p.linkStatus === 'accepted');
    const patientById = new Map(accepted.map((p) => [p.patientUserId, p]));

    if (patientById.size === 0) {
      return res.status(404).json({ message: 'Intake session not found.' });
    }

    const session = await getIntakeSessionForPatients(sessionId, [...patientById.keys()], authUser.userId);
    if (!session) {
      return res.status(404).json({ message: 'Intake session not found.' });
    }

    return res.json({
      session_id: session.id,
      patient_id: session.patient_id,
      patient_name: patientById.get(session.patient_id)?.name || 'Patient',
      chief_complaint: session.chief_complaint,
      structured_history: session.structured_history,
      priority: session.priority,
      red_flag_reason: session.red_flag_reason,
      status: session.status,
      origin: session.origin,
      intake_method: session.intake_method,
      doctor_action: session.doctor_action,
      created_at: session.created_at,
      completed_at: session.completed_at,
    });
  } catch (error) {
    console.error('Intake session detail fetch error:', error);
    return res.status(500).json({ message: 'Unable to load intake session.' });
  }
});

/**
 * Shared handler for the Complete/Remove queue actions below — same
 * ownership boundary as the detail route above: a session only resolves
 * if its patient_id belongs to one of the caller-doctor's accepted-linked
 * patients, otherwise 404 (never 403 — doesn't confirm or deny the session
 * id exists to an unauthorized caller). Writes both the session's current
 * doctor_action AND an append-only intake_session_actions audit row.
 */
async function handleIntakeQueueAction(req, res, action) {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const sessionId = String(req.params?.sessionId ?? '').trim();
  if (!sessionId) {
    return res.status(400).json({ message: 'Session ID is required.' });
  }

  try {
    const patients = await getDoctorPatients(authUser.userId);
    const accepted = patients.filter((p) => p.linkStatus === 'accepted');
    const patientIds = accepted.map((p) => p.patientUserId);

    if (patientIds.length === 0) {
      return res.status(404).json({ message: 'Intake session not found.' });
    }

    const updated = await setIntakeSessionDoctorAction({
      sessionId,
      doctorId: authUser.userId,
      patientIds,
      action,
    });
    if (!updated) {
      return res.status(404).json({ message: 'Intake session not found.' });
    }

    return res.json({ session_id: updated.id, doctor_action: updated.doctor_action });
  } catch (error) {
    console.error(`Intake queue ${action} error:`, error);
    return res.status(500).json({ message: `Unable to mark this session as ${action}.` });
  }
}

/**
 * POST /api/doctor-patients/intake-queue/:sessionId/complete
 * DOCTOR-facing. Marks a queue row as Completed (doctor has seen/consulted
 * this patient) — distinct from intake_sessions.status, which tracks
 * whether the PATIENT finished answering the intake questions (see
 * backend/db/intakeSessions.js's setIntakeSessionDoctorAction). Row drops
 * out of the live queue and appears in intake-queue/history instead.
 */
router.post('/intake-queue/:sessionId/complete', (req, res) => handleIntakeQueueAction(req, res, 'completed'));

/**
 * POST /api/doctor-patients/intake-queue/:sessionId/remove
 * DOCTOR-facing. Dismisses a queue row (e.g. a no-show, duplicate, or
 * otherwise not worth keeping in the active queue) without deleting the
 * underlying session — it drops out of the live queue and appears in
 * intake-queue/history instead, same as Complete above.
 */
router.post('/intake-queue/:sessionId/remove', (req, res) => handleIntakeQueueAction(req, res, 'removed'));

/**
 * POST /api/doctor-patients/requests/:linkId/accept
 * PATIENT-facing. Ownership (link.patient_id === req.user.userId) is
 * verified inside acceptDoctorLinkRequest, server-side — a patient
 * cannot accept a request belonging to someone else by guessing a linkId.
 */
router.post('/requests/:linkId/accept', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const linkId = String(req.params?.linkId ?? '').trim();
  if (!linkId) {
    return res.status(400).json({ message: 'Request ID is required.' });
  }

  try {
    const link = await acceptDoctorLinkRequest({ patientUserId: authUser.userId, linkId });
    return res.json({ message: 'Request accepted.', link });
  } catch (error) {
    console.error('Accept doctor request error:', error);
    const notYours = /does not belong to you/i.test(error?.message || '');
    return res.status(notYours ? 403 : 400).json({
      message: error?.message || 'Unable to accept request.',
    });
  }
});

/**
 * POST /api/doctor-patients/requests/:linkId/decline
 * PATIENT-facing. Same ownership enforcement as accept.
 */
router.post('/requests/:linkId/decline', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const linkId = String(req.params?.linkId ?? '').trim();
  if (!linkId) {
    return res.status(400).json({ message: 'Request ID is required.' });
  }

  try {
    const link = await declineDoctorLinkRequest({ patientUserId: authUser.userId, linkId });
    return res.json({ message: 'Request declined.', link });
  } catch (error) {
    console.error('Decline doctor request error:', error);
    const notYours = /does not belong to you/i.test(error?.message || '');
    return res.status(notYours ? 403 : 400).json({
      message: error?.message || 'Unable to decline request.',
    });
  }
});

/**
 * GET /api/doctor-patients/email-action/accept
 * GET /api/doctor-patients/email-action/decline
 * Clicked directly from the request email — deliberately NO auth check
 * (a patient reading email isn't logged into the app). Ownership is
 * proven by possession of the mailed token instead of a JWT; see
 * resolveDoctorLinkRequestByToken for the token lookup + the SAME
 * status='pending' race guard the in-app accept/decline buttons use, so
 * whichever channel (this link or the bell) acts first wins cleanly.
 * Renders a plain confirmation page — there's nothing else to browse to
 * from an email client.
 *
 * Declared before '/:patientId' so Express doesn't swallow this path.
 */
function renderEmailActionPage(res, { heading, message, isError = false }) {
  return res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Doctor Access Request</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); max-width: 560px; text-align: center; }
      h2 { margin-top: 0; color: ${isError ? '#dc2626' : '#2563eb'}; }
      p { line-height: 1.6; color: #475569; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${heading}</h2>
      <p>${message}</p>
    </div>
  </body>
</html>`);
}

router.get('/email-action/accept', async (req, res) => {
  const token = String(req.query?.token ?? '').trim();
  if (!token) {
    return renderEmailActionPage(res, { heading: 'Missing token', message: 'This link is missing its access token.', isError: true });
  }

  try {
    await resolveDoctorLinkRequestByToken(token, 'accepted');
    return renderEmailActionPage(res, {
      heading: 'Request accepted',
      message: 'You have granted this doctor access to your health records for the next 24 hours. Access expires automatically after that, and you can revoke it sooner at any time from the Swastha app.',
    });
  } catch (error) {
    return renderEmailActionPage(res, {
      heading: 'Unable to accept',
      message: error?.message || 'This link is invalid or has already been used.',
      isError: true,
    });
  }
});

router.get('/email-action/decline', async (req, res) => {
  const token = String(req.query?.token ?? '').trim();
  if (!token) {
    return renderEmailActionPage(res, { heading: 'Missing token', message: 'This link is missing its access token.', isError: true });
  }

  try {
    await resolveDoctorLinkRequestByToken(token, 'declined');
    return renderEmailActionPage(res, {
      heading: 'Request declined',
      message: 'This doctor has not been granted access to your health records.',
    });
  } catch (error) {
    return renderEmailActionPage(res, {
      heading: 'Unable to decline',
      message: error?.message || 'This link is invalid or has already been used.',
      isError: true,
    });
  }
});

router.post('/link', async (req, res) => {
  const authUser = getAuthUser(req);

  // Diagnostic logging — safe and minimal (do not log tokens or full patient codes)
  const bodyKeys = Object.keys(req.body || {});
  const rawPatientCode = String(req.body?.patientCode ?? '').trim();
  // Normalize common user input such as leading '#' (users sometimes paste codes with #)
  const patientCode = rawPatientCode.replace(/^#/, '').trim();
  const patientCodePresent = rawPatientCode.length > 0;

  // Log only existence/length and a truncated doctor id (no tokens, no full PII)
  console.warn(
    `[doctor-patients/link] authUser=${authUser?.userId ? authUser.userId.slice(0,8) + '...' : 'none'} bodyKeys=${bodyKeys.join(',') || 'none'} patientCodePresent=${patientCodePresent} rawLen=${rawPatientCode.length}`
  );

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (!patientCode) {
    return res.status(400).json({ message: 'Patient code is required.' });
  }

  try {
    const result = await linkDoctorToPatient({
      doctorId: authUser.userId,
      patientCode,
    });

    // Email confirmation with Accept/Decline links — only for a genuinely
    // NEW pending request. linkDoctorToPatient returns the existing link
    // as-is (no fresh email_action_token) when one already exists, so this
    // naturally skips re-emailing on a repeat/idempotent call.
    if (result.link.status === 'pending' && result.link.email_action_token && result.link.patient_email) {
      try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
        const acceptUrl = `${backendUrl}/api/doctor-patients/email-action/accept?token=${result.link.email_action_token}`;
        const declineUrl = `${backendUrl}/api/doctor-patients/email-action/decline?token=${result.link.email_action_token}`;
        await sendDoctorRequestEmail(result.link.patient_email, result.link.patient_name, acceptUrl, declineUrl);
      } catch (emailError) {
        // Best-effort — the request itself already succeeded and is
        // visible in the notification bell regardless of email delivery.
        console.warn('Doctor request email warning:', emailError?.message || emailError);
      }
    }

    const recipientId = result?.patient?.patientUserId || result?.patient?.patientId || null;
    if (recipientId) {
      try {
        await createNotification({
          recipientId,
          actorId: authUser.userId,
          actorRole: 'doctor',
          eventType: 'doctor_profile_view',
          title: 'Doctor viewed your profile',
          message: 'A doctor accessed your profile using the patient code.',
          metadata: {
            source: 'doctor_patient_link',
            doctorId: authUser.userId,
            patientCode,
          },
        });
      } catch (notificationError) {
        console.warn('Doctor profile notification warning:', notificationError?.message || notificationError);
      }
    }

    return res.json({
      message: result.link.status === 'pending' ? 'Request sent to patient.' : 'Patient linked successfully.',
      patient: result.patient,
      // Deliberately NOT the raw doctor_patient row — it carries a
      // denormalized snapshot of patient_dob/patient_blood_group/
      // patient_phone etc., which would leak health-adjacent data
      // through this field even though `patient` above is already
      // correctly minimal for a pending link.
      link: { id: result.link.id, status: result.link.status },
    });
  } catch (error) {
    console.error('Doctor patient link error:', error);
    return res.status(400).json({
      message: error?.message || 'Unable to link patient.',
    });
  }
});

/**
 * GET /api/doctor-patients/:patientId
 * DOCTOR-facing patient detail. THE security boundary for patient detail:
 * returns 403 unless the doctor_patient link for this pair is 'accepted',
 * even if the doctor hits this directly with a valid patient id. Never
 * relies on the frontend hiding a pending card.
 */
router.get('/:patientId', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const patientId = String(req.params?.patientId ?? '').trim();
  if (!patientId) {
    return res.status(400).json({ message: 'Patient ID is required.' });
  }

  try {
    // isDoctorLinkedToPatient requires status = 'accepted' (see
    // backend/db/doctorPatients.js) — pending/declined/absent all fail here.
    const allowed = await isDoctorLinkedToPatient(authUser.userId, patientId);
    if (!allowed) {
      return res.status(403).json({
        message: 'You do not have access to this patient. The patient must accept your request first.',
      });
    }

    const patients = await getDoctorPatients(authUser.userId);
    const patient = patients.find(
      (p) => p.patientUserId === patientId && p.linkStatus === 'accepted'
    );

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    return res.json({ patient });
  } catch (error) {
    console.error('Doctor patient detail error:', error);
    return res.status(500).json({ message: 'Unable to load patient.' });
  }
});

/**
 * GET /api/doctor-patients/:patientId/summary
 * DOCTOR-facing AI summary of a patient's full record timeline, for the
 * Clinical Intelligence page. Same 'accepted' link gate as the detail
 * route above — never generated (or even fetched) for a pending/declined
 * pair. Declared before the '/:patientId' DELETE (order doesn't matter
 * for DELETE, but keeping every :patientId route together for clarity).
 *
 * There's no summary caching/storage here by design: the timeline can
 * change between visits (new reports added), so this always regenerates
 * from the CURRENT report set rather than risk serving a stale summary —
 * mirrors the "regenerate on edit" behavior in reports.js's PUT handler.
 */
router.get('/:patientId/summary', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const patientId = String(req.params?.patientId ?? '').trim();
  if (!patientId) {
    return res.status(400).json({ message: 'Patient ID is required.' });
  }

  try {
    const allowed = await isDoctorLinkedToPatient(authUser.userId, patientId);
    if (!allowed) {
      return res.status(403).json({
        message: 'You do not have access to this patient. The patient must accept your request first.',
      });
    }

    const patients = await getDoctorPatients(authUser.userId);
    const patient = patients.find(
      (p) => p.patientUserId === patientId && p.linkStatus === 'accepted'
    );
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    const reports = await listTimelineReports(patientId);
    if (!reports || reports.length === 0) {
      return res.json({ summary: null, reportCount: 0 });
    }

    const ragRes = await fetch(`${RAG_BASE_URL}/patient-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.authorization,
      },
      body: JSON.stringify({
        patientName: patient.name,
        reports: reports.map((r) => ({
          title: r.title,
          category: r.category,
          doctor: r.doctor,
          hospital: r.hospital,
          reportDate: r.reportDate,
          diagnosis: r.diagnosis,
          medicines: r.medicines,
          notes: r.notes,
          analysis: r.analysis,
        })),
      }),
    });

    const data = await ragRes.json();
    if (!ragRes.ok) {
      console.error('Patient summary generation failed:', data?.error || ragRes.status);
      return res.status(502).json({ message: data?.error || 'Could not generate patient summary.' });
    }

    return res.json({ summary: data.summary, reportCount: reports.length });
  } catch (error) {
    console.error('Doctor patient summary error:', error);
    return res.status(500).json({ message: 'Failed to load patient summary', error: error.message });
  }
});

router.delete('/:patientId', async (req, res) => {
  const authUser = getAuthUser(req);

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const patientId = String(req.params?.patientId ?? '').trim();
  const linkId = String(req.body?.linkId ?? '').trim();

  if (!patientId && !linkId) {
    return res.status(400).json({ message: 'Patient ID or link ID is required.' });
  }

  try {
    const result = await deleteDoctorPatient({
      doctorId: authUser.userId,
      patientUserId: patientId,
      linkId: linkId || null,
    });

    return res.json(result);
  } catch (error) {
    console.error('Doctor patient delete error:', error);
    return res.status(400).json({
      message: error?.message || 'Unable to remove patient.',
    });
  }
});

export default router;
