// Everything that outlives a deleted account because it has no foreign key to
// the user row. Reports, the family vault, doctor links, intake sessions, check-in
// codes and search embeddings are removed by cascade or by the delete route
// itself; these tables only hold the user's id as plain text, so they were left
// behind with "all associated records deleted" already shown to the user.
//
// What happens to each:
//   ai_notice_acknowledgements deleted
//   ask_swastha_feedback       deleted
//   ask_swastha_access_log     kept as a security audit trail, but the id is replaced
//                              with a placeholder so it no longer points at a person
//   ai_request_log             kept for provider accounting, user id cleared
//   doctor certificate file    removed from disk
//
// Best-effort per step: one failure is logged and the rest still run, and a table
// that doesn't exist yet (a migration not applied) is skipped.
import fs from 'fs';
import path from 'path';
import supabase from '../config/supabase.js';

export const DELETED_ACCOUNT_PLACEHOLDER = 'deleted-account';

function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function step(label, run) {
  try {
    const { error } = await run();
    if (error && !isMissingTable(error)) {
      console.error(`[account-erasure] ${label} failed:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[account-erasure] ${label} failed:`, err?.message || err);
    return false;
  }
}

// Removes an uploaded doctor certificate, but only from inside the uploads
// directory (the stored value is a URL we generated, but never trust a stored
// path to be a safe one to unlink).
export function removeLocalUpload(fileUrl) {
  if (typeof fileUrl !== 'string') return false;
  const marker = '/uploads/';
  const at = fileUrl.indexOf(marker);
  if (at === -1) return false;
  const name = path.basename(fileUrl.slice(at + marker.length).split('?')[0]);
  if (!name || name === '.' || name === '..') return false;

  for (const root of [path.resolve(process.cwd(), 'uploads'), path.resolve(process.cwd(), 'backend', 'uploads')]) {
    const candidate = path.resolve(root, name);
    if (candidate.startsWith(root + path.sep) && fs.existsSync(candidate)) {
      try {
        fs.unlinkSync(candidate);
        return true;
      } catch (err) {
        console.error('[account-erasure] could not remove uploaded file:', err.message);
      }
    }
  }
  return false;
}

export async function eraseAccountResidue(userId, { certificateUrl } = {}) {
  const id = String(userId || '').trim();
  if (!id || !supabase) return { ok: false };

  const results = await Promise.all([
    step('ai_notice_acknowledgements', () => supabase.from('ai_notice_acknowledgements').delete().eq('user_id', id)),
    step('ask_swastha_feedback', () => supabase.from('ask_swastha_feedback').delete().eq('user_id', id)),
    step('ask_swastha_access_log (caller)', () =>
      supabase.from('ask_swastha_access_log').update({ caller_user_id: DELETED_ACCOUNT_PLACEHOLDER }).eq('caller_user_id', id)),
    step('ask_swastha_access_log (target)', () =>
      supabase.from('ask_swastha_access_log').update({ target_patient_id: DELETED_ACCOUNT_PLACEHOLDER }).eq('target_patient_id', id)),
    step('ai_request_log', () => supabase.from('ai_request_log').update({ user_id: null }).eq('user_id', id)),
  ]);

  const certificateRemoved = certificateUrl ? removeLocalUpload(certificateUrl) : false;
  return { ok: results.every(Boolean), certificateRemoved };
}
