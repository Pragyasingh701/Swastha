import express from 'express';
import jwt from 'jsonwebtoken';
import { listTimelineReports, createTimelineReport, updateTimelineReport, deleteTimelineReport } from '../db/reports.js';
import { findUserByEmail } from '../db/users.js';
import { validateTimelineReportPayload } from '../utils/timelineValidation.js';

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

// Field names AI extraction (rag/) couldn't confidently read from an
// uploaded prescription image and the patient left blank — allow-list
// against known field names, this is not free-form user input.
const KNOWN_UNCLEAR_FIELDS = ['doctor', 'hospital', 'date', 'diagnosis', 'medicines', 'notes'];
function sanitizeUnclearFields(value) {
  return Array.isArray(value) ? value.filter((f) => KNOWN_UNCLEAR_FIELDS.includes(f)) : [];
}

router.get('/', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to load timeline reports.' });
    }

    const requestedEmail = String(req.query.email || '').trim();
    let targetUserId = user.userId;

    if (requestedEmail) {
      const targetUser = await findUserByEmail(requestedEmail);
      if (!targetUser?.id) {
        return res.status(404).json({ message: 'No account found for that email.' });
      }
      targetUserId = targetUser.id;
    }

    const reports = await listTimelineReports(targetUserId);
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

    const validation = validateTimelineReportPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const { sanitized } = validation;

    const report = await createTimelineReport({
      userId: user.userId,
      title: sanitized.title,
      doctor: sanitized.doctor,
      hospital: sanitized.hospital,
      reportDate: sanitized.reportDate,
      category: sanitized.category,
      diagnosis: sanitized.diagnosis,
      medicines: sanitized.medicines,
      notes: sanitized.notes,
      fileUrl: req.body?.fileUrl || null,
      unclearFields: sanitizeUnclearFields(req.body?.unclearFields),
      source: 'manual',
    });

    return res.status(201).json({ report });
  } catch (error) {
    console.error('Timeline report save error:', error);
    return res.status(500).json({ message: 'Failed to save timeline report', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to update timeline reports.' });
    }

    const reportId = req.params.id?.trim();
    if (!reportId) {
      return res.status(400).json({ message: 'Report ID is required.' });
    }

    const validation = validateTimelineReportPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const { sanitized } = validation;

    const report = await updateTimelineReport(user.userId, reportId, {
      title: sanitized.title,
      doctor: sanitized.doctor,
      hospital: sanitized.hospital,
      reportDate: sanitized.reportDate,
      category: sanitized.category,
      diagnosis: sanitized.diagnosis,
      medicines: sanitized.medicines,
      notes: sanitized.notes,
      fileUrl: req.body?.fileUrl || null,
      unclearFields: sanitizeUnclearFields(req.body?.unclearFields),
    });

    if (!report) {
      return res.status(404).json({ message: 'Report not found, or you do not have permission to edit it.' });
    }

    return res.json({ report });
  } catch (error) {
    console.error('Timeline report update error:', error);
    return res.status(500).json({ message: 'Failed to update timeline report', error: error.message });
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
