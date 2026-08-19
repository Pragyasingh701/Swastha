import express from 'express';
import jwt from 'jsonwebtoken';
import { getDoctorPatients, linkDoctorToPatient, deleteDoctorPatient } from '../db/doctorPatients.js';

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

  if (!authUser?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // Accept either patientCode (preferred) or legacy patientUserId/userId
  const patientCode = String(req.body?.patientCode ?? req.body?.patientUserId ?? req.body?.userId ?? '').trim();

  if (!patientCode) {
    return res.status(400).json({ message: 'Patient code is required.' });
  }

  try {
    // linkDoctorToPatient accepts an identifier which may be a user id or a patient_code; forward patientCode as patientUserId
    const result = await linkDoctorToPatient({
      doctorId: authUser.userId,
      patientUserId: patientCode,
    });

    return res.json({
      message: 'Patient linked successfully.',
      patient: result.patient,
      link: result.link,
    });
  } catch (error) {
    console.error('Doctor patient link error:', error);
    return res.status(400).json({
      message: error?.message || 'Unable to link patient.',
    });
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
