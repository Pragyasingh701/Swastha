import express from 'express';
import jwt from 'jsonwebtoken';
import { getDoctorPatients, linkDoctorToPatient, deleteDoctorPatient } from '../db/doctorPatients.js';
import { createNotification } from '../db/notifications.js';

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
