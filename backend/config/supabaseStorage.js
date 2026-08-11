import multer from 'multer';
import supabase from './supabase.js';

const REPORTS_BUCKET = process.env.SUPABASE_REPORTS_BUCKET || 'reports';

console.log(`⚡ [Supabase Storage] Using bucket ${REPORTS_BUCKET}`);

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function sanitizeFileName(fileName) {
  return String(fileName)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '') || 'uploaded-file';
}

export async function uploadFileToSupabase(file) {
  if (!file) return null;
  if (!supabase) {
    throw new Error('Supabase client is not initialized.');
  }

  const filePath = `reports/${Date.now()}_${sanitizeFileName(file.originalname)}`;
  const response = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype || 'application/octet-stream',
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

export { uploadMemory };
