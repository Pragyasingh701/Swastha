import express from 'express';
import jwt from 'jsonwebtoken';
import { listTimelineReports, createTimelineReport, deleteTimelineReport } from '../db/reports.js';

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
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to load timeline reports.' });
    }

    const reports = await listTimelineReports(user.userId);
    return res.json({ reports });
  } catch (error) {
    console.error('Timeline reports load error:', error);
    return res.status(500).json({ message: 'Failed to load timeline reports', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to save timeline reports.' });
    }

    const { title, doctor, hospital, reportDate, category, diagnosis, medicines, notes, fileUrl } = req.body;
    if (!title || !doctor || !hospital || !reportDate || !category || !diagnosis || !medicines) {
      return res.status(400).json({ message: 'Missing required report fields.' });
    }

    const report = await createTimelineReport({
      userId: user.userId,
      title: title.trim(),
      doctor: doctor.trim(),
      hospital: hospital.trim(),
      reportDate,
      category: category.trim(),
      diagnosis: diagnosis.trim(),
      medicines: medicines.trim(),
      notes: (notes || '').trim(),
      fileUrl: fileUrl || null,
      source: 'manual',
    });

    return res.status(201).json({ report });
  } catch (error) {
    console.error('Timeline report save error:', error);
    return res.status(500).json({ message: 'Failed to save timeline report', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to delete timeline reports.' });
    }

    const reportId = req.params.id?.trim();
    if (!reportId) {
      return res.status(400).json({ message: 'Report ID is required.' });
    }

    const deletedReport = await deleteTimelineReport(user.userId, reportId);
    return res.json({ report: deletedReport });
  } catch (error) {
    console.error('Timeline report delete error:', error);
    return res.status(500).json({ message: 'Failed to delete timeline report', error: error.message });
  }
});

export default router;
