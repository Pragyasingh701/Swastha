import express from 'express';
import jwt from 'jsonwebtoken';
import { listTimelineReports, getTimelineReport, createTimelineReport, updateTimelineReport, deleteTimelineReport } from '../db/reports.js';
import { findUserByEmail } from '../db/users.js';
import { validateTimelineReportPayload } from '../utils/timelineValidation.js';
import { uploadMemory, uploadFileToSupabase } from '../config/supabaseStorage.js';
import supabase from '../config/supabase.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';
const RAG_BASE_URL = process.env.RAG_BASE_URL || 'http://localhost:3010/api';

// Generates an AI summary for a report via rag/'s /api/summarize (see
// rag/src/services/summaryService.js) — forwards the same user JWT this
// request already carried, since this is a server-to-server call standing
// in for the original user, not a separate identity.
//
// Called synchronously right after create/update, before responding, so
// the summary is guaranteed to already exist by the time anyone clicks
// "AI Summary" — never generated on click. Failure here does NOT fail the
// report save — the report is still valid without a summary, same
// graceful-degradation pattern as AI extraction elsewhere in this app.
async function generateSummary(authHeader, report) {
  try {
    const res = await fetch(`${RAG_BASE_URL}/summarize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        title: report.title,
        doctor: report.doctor,
        hospital: report.hospital,
        category: report.category,
        reportDate: report.reportDate,
        diagnosis: report.diagnosis,
        medicines: report.medicines,
        notes: report.notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || `rag summarize returned HTTP ${res.status}`);
    }
    return data.summary || null;
  } catch (err) {
    console.error(`AI summary generation failed for report ${report.id}:`, err.message || err);
    return null;
  }
}

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

// Matches both "Lab Report" and "Lab Reports" (both appear in the wild —
// see MedicalVault.jsx/Timeline.jsx's category configs), case-insensitively.
function isLabReportCategory(category) {
  const normalized = String(category || '').trim().toLowerCase();
  return normalized === 'lab report' || normalized === 'lab reports';
}

router.get('/lab-insights', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to load lab insights.' });
    }

    const allReports = await listTimelineReports(user.userId);
    const labReports = allReports.filter((r) => isLabReportCategory(r.category));

    if (labReports.length === 0) {
      return res.json({ insights: null, labReportCount: 0 });
    }

    const ragRes = await fetch(`${RAG_BASE_URL}/lab-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.authorization,
      },
      body: JSON.stringify({
        reports: labReports.map((r) => ({
          title: r.title,
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
      console.error('Lab insights generation failed:', data?.error || ragRes.status);
      return res.status(502).json({ message: data?.error || 'Could not generate lab insights.' });
    }

    return res.json({ insights: data.insights, labReportCount: labReports.length });
  } catch (error) {
    console.error('Lab insights endpoint error:', error);
    return res.status(500).json({ message: 'Failed to load lab insights', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to load timeline reports.' });
    }

    const requestedEmail = String(req.query.email || '').trim();
    const requestedUserId = String(req.query.userId || '').trim();
    let targetUserId = user.userId;

    if (requestedUserId) {
      targetUserId = requestedUserId;
    } else if (requestedEmail) {
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
      ? await uploadFileToSupabase(req.file)
      : String(req.body?.fileUrl || '').trim() || null;

    let report = await createTimelineReport({
      userId: user.userId,
      title: sanitized.title,
      doctor: sanitized.doctor,
      hospital: sanitized.hospital,
      reportDate: sanitized.reportDate,
      category: sanitized.category,
      diagnosis: sanitized.diagnosis,
      medicines: sanitized.medicines,
      notes: sanitized.notes,
      analysis: null, // filled in below once AI summarization finishes
      fileUrl: uploadedFileUrl,
      unclearFields: sanitizeUnclearFields(req.body?.unclearFields),
      source: 'manual',
    });

    // Summarize now, before responding, so "AI Summary" is instant on
    // click later — never generated on demand. A failure here doesn't
    // fail the save; the report just has no summary yet.
    const summary = await generateSummary(req.headers.authorization, report);
    if (summary) {
      const updated = await updateTimelineReport(user.userId, report.id, { ...report, analysis: summary });
      if (updated) report = updated;
    }

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
      ? await uploadFileToSupabase(req.file)
      : String(req.body?.fileUrl || '').trim() || null;

    let report = await updateTimelineReport(user.userId, reportId, {
      title: sanitized.title,
      doctor: sanitized.doctor,
      hospital: sanitized.hospital,
      reportDate: sanitized.reportDate,
      category: sanitized.category,
      diagnosis: sanitized.diagnosis,
      medicines: sanitized.medicines,
      notes: sanitized.notes,
      analysis: null, // regenerated below — edited content needs a fresh summary
      fileUrl: uploadedFileUrl,
      unclearFields: sanitizeUnclearFields(req.body?.unclearFields),
    });

    if (!report) {
      return res.status(404).json({ message: 'Report not found, or you do not have permission to edit it.' });
    }

    // Content may have changed — regenerate the summary before responding,
    // same as on create, so it's instant on click and never stale.
    const summary = await generateSummary(req.headers.authorization, report);
    if (summary) {
      const updated = await updateTimelineReport(user.userId, report.id, { ...report, analysis: summary });
      if (updated) report = updated;
    }

    return res.json({ report });
  } catch (error) {
    console.error('Timeline report update error:', error);
    return res.status(500).json({ message: 'Failed to update timeline report', error: error.message });
  }
});

// On-demand summary generation — hit when the user clicks "AI Summary" on
// a report that doesn't have one yet (e.g. saved before this feature
// existed, or generation failed at save time). Normally the summary
// already exists by save time (see generateSummary() above, called from
// POST/PUT); this is the fallback path for whenever it doesn't.
router.post('/:id/summarize', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to generate a summary.' });
    }

    const reportId = req.params.id?.trim();
    if (!reportId) {
      return res.status(400).json({ message: 'Report ID is required.' });
    }

    const existing = await getTimelineReport(user.userId, reportId);
    if (!existing) {
      return res.status(404).json({ message: 'Report not found, or you do not have permission to view it.' });
    }

    if (existing.analysis) {
      // Already has one — nothing to regenerate, just hand it back.
      return res.json({ report: existing });
    }

    const summary = await generateSummary(req.headers.authorization, existing);
    if (!summary) {
      return res.status(502).json({ message: 'Could not generate an AI summary for this report. Please try again.' });
    }

    const updated = await updateTimelineReport(user.userId, reportId, { ...existing, analysis: summary });
    if (!updated) {
      return res.status(404).json({ message: 'Report not found, or you do not have permission to edit it.' });
    }

    return res.json({ report: updated });
  } catch (error) {
    console.error('On-demand summary generation error:', error);
    return res.status(500).json({ message: 'Failed to generate summary', error: error.message });
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
