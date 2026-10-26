import express from 'express';
import { listTimelineReports, getTimelineReport, getTimelineReportById, createTimelineReport, updateTimelineReport, deleteTimelineReport } from '../db/reports.js';
import { findUserByEmail, findUserById } from '../db/users.js';
import { isDoctorLinkedToPatient } from '../db/doctorPatients.js';
import { isPatientLinkedToFamilyMember } from '../db/family.js';
import { validateTimelineReportPayload } from '../utils/timelineValidation.js';
import { uploadMemory, uploadFileToSupabase, createSignedFileUrl, removeStoredFiles } from '../config/supabaseStorage.js';
import { decryptMultipartFields } from '../middleware/wireCrypto.js';
import { getAuthUser } from '../config/jwt.js';

const router = express.Router();
// RAG used to be a separate service/process (RAG_BASE_URL pointed at its
// own port); it's now mounted in-process at /rag (see server.js), so this
// defaults to a loopback call on this same server instead of a second
// service. RAG_BASE_URL is still overridable for anyone still running it
// standalone.
const RAG_BASE_URL = process.env.RAG_BASE_URL || `http://localhost:${process.env.PORT || 5001}/rag/api`;

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
async function generateSummaryResult(authHeader, report) {
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
    // The user hasn't accepted how Swastha uses AI yet: not an error to hide —
    // callers that can ask the user (the on-demand route) pass it on so the UI
    // can show the notice; the save paths just skip the summary.
    if (res.status === 403 && data?.code === 'AI_NOTICE_ACK_REQUIRED') {
      return { summary: null, consentRequired: { code: data.code, feature: data.feature, notice_version: data.notice_version } };
    }
    if (!res.ok) {
      throw new Error(data?.error || `rag summarize returned HTTP ${res.status}`);
    }
    return { summary: data.summary || null };
  } catch (err) {
    console.error(`AI summary generation failed for report ${report.id}:`, err.message || err);
    return { summary: null };
  }
}

async function generateSummary(authHeader, report) {
  return (await generateSummaryResult(authHeader, report)).summary;
}

// The single access gate for touching someone else's timeline — shared by
// the read route and every write route so the two can't drift apart again
// (GET used to check doctors only, leaving every other role unchecked).
async function assertCanAccessTarget(authUser, targetUserId) {
  if (targetUserId === authUser.userId) {
    return;
  }

  if (authUser.role === 'doctor') {
    let linked;
    try {
      linked = await isDoctorLinkedToPatient(authUser.userId, targetUserId);
    } catch (err) {
      // A genuine DB/network failure inside the link check, not "not
      // linked" — isDoctorLinkedToPatient throws on a real error rather
      // than swallowing it (see backend/db/doctorPatients.js). Tag this so
      // every call site below can return 500 here instead of folding a
      // real server error into the same 403 an unlinked/expired doctor
      // gets — those are different failures and shouldn't look the same.
      const wrapped = new Error('Could not verify patient access. Please try again.');
      wrapped.status = 500;
      wrapped.cause = err;
      throw wrapped;
    }
    if (!linked) {
      throw new Error('You are not linked to this patient.');
    }
    return;
  }

  if (authUser.role === 'patient') {
    const isFamilyMember = await isPatientLinkedToFamilyMember(authUser.userId, targetUserId);
    if (isFamilyMember) {
      return;
    }
  }

  throw new Error('You do not have permission to access this timeline.');
}

async function resolveTargetUser(req, authUser) {
  const requestedUserId = String(req.body?.userId || req.query?.userId || '').trim();
  const requestedEmail = String(req.body?.targetEmail || req.query?.email || '').trim().toLowerCase();
  let targetUser = null;

  if (requestedUserId) {
    targetUser = await findUserById(requestedUserId);
  } else if (requestedEmail) {
    targetUser = await findUserByEmail(requestedEmail);
  }

  // Someone else was asked for but cannot be found (for example a family member who has
  // no account yet). Answer exactly as GET does, never fall back to the caller's own
  // timeline: that quietly saved, changed or deleted the family member's report on the
  // admin's own account.
  if ((requestedUserId || requestedEmail) && !targetUser?.id) {
    const notFound = new Error('You do not have permission to access this timeline.');
    notFound.status = 403;
    throw notFound;
  }

  const targetUserId = targetUser?.id || authUser.userId;
  await assertCanAccessTarget(authUser, targetUserId);
  return targetUserId;
}

// Multer middleware wrapper with error handling
function handleReportFileUpload(req, res, next) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.startsWith('multipart/form-data')) {
    return next();
  }

  // Checked before the body is parsed: multer buffers up to 10 MB in memory,
  // which an anonymous caller must not be able to make the server do.
  if (!getAuthUser(req)?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  uploadMemory.single('file')(req, res, async (err) => {
    if (err) {
      console.error('Report file upload error:', err);
      return res.status(400).json({ message: err.message || 'File upload failed.' });
    }
    try {
      // Multer only populates req.body once this callback fires — the
      // global piiWireBoundary middleware (mounted before any route) had
      // already run against an empty body at that point, so the one
      // encrypted `encryptedFields` form field it left behind
      // (frontend/src/api/pii/multipart.js) needs unpacking here instead.
      await decryptMultipartFields(req);
    } catch (decryptErr) {
      console.error('Report file upload: encrypted field decryption error:', decryptErr);
      return res.status(400).json({ message: 'Malformed encrypted request.' });
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
    if (ragRes.status === 403 && data?.code === 'AI_NOTICE_ACK_REQUIRED') {
      return res.status(403).json({
        message: 'Please review how Swastha uses AI before generating lab insights.',
        code: data.code,
        feature: data.feature,
        notice_version: data.notice_version,
      });
    }
    if (!ragRes.ok) {
      console.error('Lab insights generation failed:', data?.error || ragRes.status);
      return res.status(502).json({ message: data?.error || 'Could not generate lab insights.' });
    }

    return res.json({ insights: data.insights, labReportCount: labReports.length });
  } catch (error) {
    console.error('Lab insights endpoint error:', error);
    return res.status(500).json({ message: 'Failed to load lab insights' });
  }
});

// Short-lived signed URL for a report's attached file. The file is served
// only after the same access check the timeline uses (owner, linked doctor,
// confirmed family admin) — so it keeps working if the bucket is made private,
// and a file URL alone is never what grants access.
router.get('/:id/file-url', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const report = await getTimelineReportById(req.params.id);
    const denied = () => res.status(403).json({ message: 'You do not have permission to access this file.' });
    if (!report?.user_id || !report.fileUrl) {
      return denied();
    }

    try {
      await assertCanAccessTarget(user, report.user_id);
    } catch (accessError) {
      return res.status(accessError.status === 500 ? 500 : 403).json({ message: accessError.status === 500 ? accessError.message : 'You do not have permission to access this file.' });
    }

    const url = await createSignedFileUrl(report.fileUrl, 300);
    if (!url) {
      return res.status(404).json({ message: 'This report has no viewable file.' });
    }
    return res.json({ url, expiresInSeconds: 300 });
  } catch (error) {
    console.error('Report file URL error:', error);
    return res.status(500).json({ message: 'Could not open this file.' });
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

    if (requestedUserId || requestedEmail) {
      const targetUser = requestedUserId
        ? await findUserById(requestedUserId)
        : await findUserByEmail(requestedEmail);
      // An unknown target gets the same answer as an unauthorized one, so
      // this can't be used to probe which emails/ids have accounts.
      if (!targetUser?.id) {
        return res.status(403).json({ message: 'You do not have permission to access this timeline.' });
      }
      targetUserId = targetUser.id;
    }

    try {
      await assertCanAccessTarget(user, targetUserId);
    } catch (accessError) {
      return res.status(accessError.status || 403).json({ message: accessError.message });
    }

    const reports = await listTimelineReports(targetUserId);
    return res.json({ reports });
  } catch (error) {
    console.error('Timeline reports load error:', error);
    return res.status(500).json({ message: 'Failed to load timeline reports' });
  }
});

router.post('/', handleReportFileUpload, async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to save timeline reports.' });
    }

    let targetUserId;
    try {
      targetUserId = await resolveTargetUser(req, user);
    } catch (targetError) {
      // A tagged 500 (a real DB/network failure in the link check itself,
      // not "not linked") is distinct from the default 403 for a
      // genuinely unlinked/expired doctor or unauthorized family member —
      // see resolveTargetUser's isDoctorLinkedToPatient catch above.
      return res.status(targetError.status || 403).json({ message: targetError.message });
    }

    const validation = validateTimelineReportPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const { sanitized } = validation;
    // A report's file only ever comes from an actual upload. A client-supplied
    // fileUrl used to be stored as-is and later rendered in an iframe/link
    // (script injection via "javascript:" URLs, or pointing at someone else's
    // file), so it is ignored here.
    const uploadedFileUrl = req.file ? await uploadFileToSupabase(req.file, targetUserId) : null;

    let report = await createTimelineReport({
      userId: targetUserId,
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
      const updated = await updateTimelineReport(targetUserId, report.id, { ...report, analysis: summary });
      if (updated) report = updated;
    }


    return res.status(201).json({ report });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Timeline report save error:', error);
    return res.status(500).json({ message: 'Failed to save timeline report' });
  }
});

router.put('/:id', handleReportFileUpload, async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to update timeline reports.' });
    }

    let targetUserId;
    try {
      targetUserId = await resolveTargetUser(req, user);
    } catch (targetError) {
      // A tagged 500 (a real DB/network failure in the link check itself,
      // not "not linked") is distinct from the default 403 for a
      // genuinely unlinked/expired doctor or unauthorized family member —
      // see resolveTargetUser's isDoctorLinkedToPatient catch above.
      return res.status(targetError.status || 403).json({ message: targetError.message });
    }

    const reportId = req.params.id?.trim();
    if (!reportId) {
      return res.status(400).json({ message: 'Report ID is required.' });
    }

    const validation = validateTimelineReportPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const existingReport = await getTimelineReport(targetUserId, reportId);
    if (!existingReport) {
      return res.status(404).json({ message: 'Report not found, or you do not have permission to edit it.' });
    }

    const { sanitized } = validation;
    // The file changes only by uploading a new one, or is cleared when the
    // client explicitly sends an empty fileUrl. Any other fileUrl value (a
    // different URL, a script string) is ignored and the stored file kept.
    let nextFileUrl = existingReport.fileUrl || null;
    if (req.file) {
      nextFileUrl = await uploadFileToSupabase(req.file, targetUserId);
    } else if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'fileUrl') && !String(req.body.fileUrl || '').trim()) {
      nextFileUrl = null;
    }
    const uploadedFileUrl = nextFileUrl;

    let report = await updateTimelineReport(targetUserId, reportId, {
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

    if (existingReport.fileUrl && existingReport.fileUrl !== uploadedFileUrl) {
      removeStoredFiles([existingReport.fileUrl]);
    }

    // Content may have changed — regenerate the summary before responding,
    // same as on create, so it's instant on click and never stale.
    const summary = await generateSummary(req.headers.authorization, report);
    if (summary) {
      const updated = await updateTimelineReport(targetUserId, report.id, { ...report, analysis: summary });
      if (updated) report = updated;
    }


    return res.json({ report });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error('Timeline report update error:', error);
    return res.status(500).json({ message: 'Failed to update timeline report' });
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

    // `force` is the Regenerate button: write a fresh summary even though one exists. Without it
    // an existing summary is simply handed back. A forced attempt that fails keeps the old
    // summary (the update below only runs once a new one exists).
    const force = req.body?.force === true;
    if (existing.analysis && !force) {
      return res.json({ report: existing });
    }

    const { summary, consentRequired } = await generateSummaryResult(req.headers.authorization, existing);
    if (consentRequired) {
      return res.status(403).json({
        message: 'Please review how Swastha uses AI before generating summaries.',
        ...consentRequired,
      });
    }
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
    return res.status(500).json({ message: 'Failed to generate summary' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required to delete timeline reports.' });
    }

    let targetUserId;
    try {
      targetUserId = await resolveTargetUser(req, user);
    } catch (targetError) {
      // A tagged 500 (a real DB/network failure in the link check itself,
      // not "not linked") is distinct from the default 403 for a
      // genuinely unlinked/expired doctor or unauthorized family member —
      // see resolveTargetUser's isDoctorLinkedToPatient catch above.
      return res.status(targetError.status || 403).json({ message: targetError.message });
    }

    const reportId = req.params.id?.trim();
    if (!reportId) {
      return res.status(400).json({ message: 'Report ID is required.' });
    }

    const deletedReport = await deleteTimelineReport(targetUserId, reportId);
    if (deletedReport?.fileUrl) {
      removeStoredFiles([deletedReport.fileUrl]);
    }


    return res.json({ report: deletedReport });
  } catch (error) {
    console.error('Timeline report delete error:', error);
    return res.status(500).json({ message: 'Failed to delete timeline report' });
  }
});

export default router;
