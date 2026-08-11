import express from 'express';
import multer from 'multer';
import { extractReportFromImage } from '../config/gemini.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// In-memory storage — the file is only needed transiently to send to
// Gemini Vision, never persisted here. If the caller wants the file kept
// around (e.g. as fileUrl on the saved report), that still goes through
// backend/api/auth/upload as before; this endpoint is extraction-only.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB, matches backend's upload limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const isPdfByName = (file.originalname || '').toLowerCase().endsWith('.pdf');

    if (allowed.includes(file.mimetype) || isPdfByName) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, PNG, or WEBP files are supported for AI extraction.'));
    }
  },
});

/**
 * POST /api/extract
 * multipart/form-data, field name "file" — an image of a medical report.
 * Returns { fields, unclear } — best-effort extracted fields plus the list
 * of field keys Gemini couldn't confidently read (e.g. illegible
 * handwriting), for the user to review/fill in before saving via
 * backend/api/reports. Never saves anything itself.
 */
router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
      const { fields, unclear } = await extractReportFromImage({
        data: req.file.buffer.toString('base64'),
        mime: req.file.mimetype,
      });
      return res.status(200).json({ fields, unclear });
    } catch (extractErr) {
      console.error(`[POST /api/extract] failed for user ${req.user.userId}:`, extractErr);
      return res.status(500).json({
        error: 'Could not extract report details from this file. Please fill the form manually.',
      });
    }
  });
});

export default router;
