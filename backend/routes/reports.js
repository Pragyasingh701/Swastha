import express from 'express';
import jwt from 'jsonwebtoken';
import { listTimelineReports, createTimelineReport, updateTimelineReport, deleteTimelineReport } from '../db/reports.js';
import { findUserByEmail } from '../db/users.js';
import { validateTimelineReportPayload } from '../utils/timelineValidation.js';
import { uploadMemory } from '../config/supabaseStorage.js';
import { uploadImageToCloudinary } from '../config/cloudinary.js';
import { uploadFileToSupabase } from '../config/supabaseStorage.js';
import supabase from '../config/supabase.js';

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

// Multer middleware wrapper with error handling
function handleReportFileUpload(req, res, next) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.startsWith('multipart/form-data')) {
    return next();
  }

  uploadMemory.single('file')(req, res, (err) => {
    if (err) {
      console.error('Report file upload error:', err);
      return res.status(400).json({ message: err.message || 'File upload failed.' });
    }
    next();
  });
}

// Field names AI extraction (rag/) couldn't confidently read from an
// uploaded prescription image and the patient left blank — allow-list
// against known field names, this is not free-form user input.
const KNOWN_UNCLEAR_FIELDS = ['doctor', 'hospital', 'date', 'diagnosis', 'medicines', 'notes'];
function sanitizeUnclearFields(value) {
  let fields = value;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch {
      fields = [];
    }
  }
  return Array.isArray(fields) ? fields.filter((f) => KNOWN_UNCLEAR_FIELDS.includes(f)) : [];
}

router.get('/file', async (req, res) => {
  const fileUrl = String(req.query.url || '').trim();

  if (!fileUrl) {
    return res.status(400).json({ message: 'A file URL is required.' });
  }

  try {
    const upstreamResponse = await fetch(fileUrl);
    if (!upstreamResponse.ok) {
      return res.status(upstreamResponse.status).send('Unable to load the requested file.');
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    res.setHeader('Content-Disposition', 'inline; filename="report-file"');
    return res.send(buffer);
  } catch (error) {
    console.error('File preview proxy error:', error);
    return res.status(502).json({ message: 'Unable to load the requested file.' });
  }
});

// Return a short-lived signed URL for a storage object path (private buckets)
router.get('/signed-url', async (req, res) => {
  const path = String(req.query.path || '').trim();
  if (!path) {
    return res.status(400).json({ message: 'A storage path is required (e.g. reports/123.pdf).' });
  }

  try {
    const bucket = process.env.SUPABASE_REPORTS_BUCKET || 'reports';
    const expiresIn = Number(req.query.expiresIn) || 60; // seconds
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) {
      console.error('Signed URL generation error:', error.message || error);
      return res.status(502).json({ message: error.message || 'Failed to generate signed URL.' });
    }

    return res.json({ url: data.signedUrl });
  } catch (err) {
    console.error('Signed URL endpoint error:', err);
    return res.status(500).json({ message: 'Unable to generate signed URL.' });
  }
});

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

router.post('/', handleReportFileUpload, async (req, res) => {
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
    const uploadedFileUrl = req.file
      ? (req.file.mimetype && req.file.mimetype.startsWith('image/')
          ? await uploadImageToCloudinary(req.file)
          : await uploadFileToSupabase(req.file))
      : String(req.body?.fileUrl || '').trim() || null;

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
      analysis: req.body?.analysis || null,
      fileUrl: uploadedFileUrl,
      unclearFields: sanitizeUnclearFields(req.body?.unclearFields),
      source: 'manual',
    });

    return res.status(201).json({ report });
  } catch (error) {
    console.error('Timeline report save error:', error);
    return res.status(500).json({ message: 'Failed to save timeline report', error: error.message });
  }
});

router.put('/:id', handleReportFileUpload, async (req, res) => {
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
    const uploadedFileUrl = req.file
      ? (req.file.mimetype && req.file.mimetype.startsWith('image/')
          ? await uploadImageToCloudinary(req.file)
          : await uploadFileToSupabase(req.file))
      : String(req.body?.fileUrl || '').trim() || null;

    const report = await updateTimelineReport(user.userId, reportId, {
      title: sanitized.title,
      doctor: sanitized.doctor,
      hospital: sanitized.hospital,
      reportDate: sanitized.reportDate,
      category: sanitized.category,
      diagnosis: sanitized.diagnosis,
      medicines: sanitized.medicines,
      notes: sanitized.notes,
      analysis: req.body?.analysis || null,
      fileUrl: uploadedFileUrl,
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
