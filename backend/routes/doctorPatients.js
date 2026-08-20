import express from 'express';
import jwt from 'jsonwebtoken';
import {
  getDoctorPatients,
  linkDoctorToPatient,
  deleteDoctorPatient,
  getPendingRequestsForPatient,
  acceptDoctorLinkRequest,
  declineDoctorLinkRequest,
  isDoctorLinkedToPatient,
  getDoctorNotifications,
  getPatientNotifications,
} from '../db/doctorPatients.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

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
