import { randomUUID } from 'node:crypto';
import multer from 'multer';
import supabase from './supabase.js';

const REPORTS_BUCKET = process.env.SUPABASE_REPORTS_BUCKET || 'reports';

console.log(`⚡ [Supabase Storage] Using bucket ${REPORTS_BUCKET}`);

// Only documents a report can reasonably be: the type is decided from the
// file's own bytes below, never from the client's filename or Content-Type
// header (an ".html" or ".svg" renamed to ".png" must not be stored and
// served as active content).
const ALLOWED_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  // Cheap early rejection on the declared type; the real check is
  // sniffFileType() on the bytes, in uploadFileToSupabase.
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true);
    const err = new Error('Invalid file type. Only PDF, JPEG, PNG and WEBP files are allowed.');
    err.status = 400;
    return cb(err);
  },
});

// Magic-byte detection for the allowed types. Returns the mime type, or null.
export function sniffFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.slice(0, 4).toString('latin1') === 'RIFF' && buffer.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'unknown';
}

// Uploads under reports/<patientId>/<random uuid>.<ext>: not guessable (the
// old "reports/<timestamp>_<original name>" was), the original filename is
// never used, and the extension comes from the sniffed type. Returns the
// object's URL, which is stored on the report as before.
export async function uploadFileToSupabase(file, ownerId) {
  if (!file) return null;
  if (!supabase) {
    throw new Error('Supabase client is not initialized.');
  }

  const detectedType = sniffFileType(file.buffer);
  if (!detectedType || !ALLOWED_TYPES[detectedType]) {
    const err = new Error('The uploaded file is not a valid PDF, JPEG, PNG or WEBP document.');
    err.status = 400;
    throw err;
  }

  const filePath = `reports/${safeSegment(ownerId)}/${randomUUID()}.${ALLOWED_TYPES[detectedType]}`;
  const response = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(filePath, file.buffer, {
      contentType: detectedType,
      upsert: false,
    });

  if (response.error) {
    const errorMessage = response.error.message || 'Failed to upload file to Supabase Storage.';
    throw new Error(`${errorMessage} (bucket=${REPORTS_BUCKET})`);
  }

  const publicUrlResponse = supabase.storage.from(REPORTS_BUCKET).getPublicUrl(filePath);
  if (publicUrlResponse.error) {
    throw new Error(`${publicUrlResponse.error.message || 'Failed to generate public URL for uploaded file.'} (bucket=${REPORTS_BUCKET})`);
  }

  return publicUrlResponse.data.publicUrl;
}

// Extracts the object path inside our reports bucket from a stored file URL,
// or null if the URL is anything else (another host, another bucket, a
// "javascript:" string, ...). Works for public and signed URL forms, so it
// keeps working whether the bucket is public or has been made private.
export function storagePathFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(fileUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  let storageHost;
  try {
    storageHost = new URL(process.env.SUPABASE_URL || '').host;
  } catch {
    return null;
  }
  if (!storageHost || parsed.host !== storageHost) return null;

  const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
  if (!match || match[1] !== REPORTS_BUCKET) return null;

  try {
    return decodeURIComponent(match[2]);
  } catch {
    return null;
  }
}

// Short-lived signed URL for a stored report file, or null if the stored
// value isn't one of our bucket's objects.
export async function createSignedFileUrl(fileUrl, expiresInSeconds = 300) {
  const filePath = storagePathFromUrl(fileUrl);
  if (!filePath || !supabase) return null;
  const { data, error } = await supabase.storage.from(REPORTS_BUCKET).createSignedUrl(filePath, expiresInSeconds);
  if (error) {
    console.error('Signed URL generation error:', error.message || error);
    return null;
  }
  return data?.signedUrl || null;
}

// Best-effort removal of the objects behind stored file URLs (report deleted,
// file replaced, account deleted). Never throws: a leftover object must not
// fail the delete the user asked for.
export async function removeStoredFiles(fileUrls) {
  if (!supabase) return;
  const paths = [...new Set((fileUrls || []).map(storagePathFromUrl).filter(Boolean))];
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from(REPORTS_BUCKET).remove(paths);
    if (error) console.error('Storage cleanup error:', error.message || error);
  } catch (err) {
    console.error('Storage cleanup failed:', err.message || err);
  }
}

export { uploadMemory };
