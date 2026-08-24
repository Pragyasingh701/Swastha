import crypto from 'crypto';
import supabase from '../config/supabase.js';

// Clinic check-in flow (PRD §3) — walk-in patients read a doctor-specific
// code displayed at the clinic instead of following a remote intake link.
// This module owns the code lifecycle (lazy daily generation, public
// lookup) and the audited treatment_method change record. Ownership/auth
// decisions stay in the route layer (backend/routes/clinic.js), same
// boundary as doctorPatients.js not deciding auth for its callers.

// Excludes 0/O, 1/I/l for wall-display legibility (PRD §3.2) — a doctor or
// clinic staff reading this off a printed sheet or a TV screen across a
// waiting room must not have to guess whether a character is a zero or the
// letter O, a one or a lowercase L or capital I.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0, O, 1, I, L
const CODE_LENGTH = 6;

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
  }
  return code;
}

// Today's date as a plain 'YYYY-MM-DD' string (matches the `date` column
// type in clinic_checkin_codes.valid_date) — deliberately server-local
// calendar date, same granularity the PRD's "refreshed daily" / "auto-
// refresh at local midnight" language assumes throughout §3 and §5.
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Lazily resolves today's check-in code for a doctor: returns the existing
 * row for (doctor_id, today) if present, otherwise generates and inserts
 * one. Collisions against the (code, valid_date) UNIQUE constraint are
 * retried with a fresh random code — extremely unlikely at this charset
 * size (32^6) but handled rather than assumed away.
 *
 * DOCTOR-facing only (dashboard display) — the caller (route) must already
 * have verified doctorId came from the doctor's own JWT, never a client-
 * supplied id, same as every other doctor-scoped call in this codebase.
 *
 * @param {string} doctorId
 * @returns {Promise<{ code: string, valid_date: string }>}
 */
export async function getOrCreateTodayCode(doctorId) {
  if (!doctorId) throw new Error('getOrCreateTodayCode: doctorId is required');
  if (!supabase) throw new Error('Database connection is unavailable.');

  const validDate = todayDateString();

  const { data: existing, error: fetchError } = await supabase
    .from('clinic_checkin_codes')
    .select('code, valid_date')
    .eq('doctor_id', doctorId)
    .eq('valid_date', validDate)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(`getOrCreateTodayCode: lookup failed: ${fetchError.message}`);
  }
  if (existing) return existing;

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from('clinic_checkin_codes')
      .insert({ doctor_id: doctorId, code, valid_date: validDate })
      .select('code, valid_date')
      .single();

    if (!error) return data;

    // 23505 = unique_violation. Could be the (doctor_id, valid_date) key
    // (a concurrent request for the same doctor already created today's
    // row — re-fetch and use that one) or the (code, valid_date) key (a
    // random collision with a DIFFERENT doctor's code today — retry with a
    // fresh code). Either way, re-check doctor_id+valid_date first since
    // that's the far more likely and cheaper-to-resolve case.
    if (error.code === '23505') {
      const { data: raceWinner } = await supabase
        .from('clinic_checkin_codes')
        .select('code, valid_date')
        .eq('doctor_id', doctorId)
        .eq('valid_date', validDate)
        .maybeSingle();
      if (raceWinner) return raceWinner;
      continue; // code collision with another doctor — loop and retry
    }
    throw new Error(`getOrCreateTodayCode: insert failed: ${error.message}`);
  }

  throw new Error('getOrCreateTodayCode: failed to generate a unique code after multiple attempts');
}

/**
 * PUBLIC lookup for POST /api/clinic/verify-code — resolves {code, today}
 * to display-only doctor identity. Returns null on ANY miss (wrong code,
 * expired/yesterday's code, unknown doctor) so the route can return one
 * generic error without distinguishing failure reasons (PRD §3.3/§3.4: "one
 * generic error on any failure — never distinguish wrong/expired/unknown").
 *
 * @param {string} code
 * @returns {Promise<{ doctorId: string, doctorName: string, clinicName: string } | null>}
 */
export async function resolveCheckinCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || !supabase) return null;

  const validDate = todayDateString();

  const { data: row, error } = await supabase
    .from('clinic_checkin_codes')
    .select('doctor_id')
    .eq('code', normalized)
    .eq('valid_date', validDate)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.warn('resolveCheckinCode lookup warning:', error.message);
    return null;
  }
  if (!row) return null;

  const { data: doctor, error: doctorError } = await supabase
    .from('doctors')
    .select('id, name, hospital_name')
    .eq('id', row.doctor_id)
    .maybeSingle();

  if (doctorError || !doctor) return null;

  // Deliberately minimal — display identity ONLY (PRD §3.4: "a bare code
  // never exposes sensitive data"). No specialty, no license, no email,
  // no treatment_method, nothing else from the doctors row.
  return {
    doctorId: doctor.id,
    doctorName: doctor.name || 'Doctor',
    clinicName: doctor.hospital_name || null,
  };
}

/**
 * Writes an audited row for a treatment_method change (PRD §3.2/§4.3).
 * There is no HTTP route calling this yet — no admin-auth model exists in
 * this codebase to gate one safely — but the audit trail + this db-layer
 * function exist so a future admin tool (or a one-off support script) has
 * a single correct place to record the change rather than hand-writing SQL
 * against doctors + doctor_method_changes separately.
 *
 * @param {{ doctorId: string, oldMethod: string|null, newMethod: string, changedBy: string }} params
 */
export async function recordMethodChange({ doctorId, oldMethod, newMethod, changedBy }) {
  if (!doctorId || !newMethod || !changedBy) {
    throw new Error('recordMethodChange: doctorId, newMethod, and changedBy are required');
  }
  if (!['allopathic', 'ayurvedic'].includes(newMethod)) {
    throw new Error('recordMethodChange: newMethod must be "allopathic" or "ayurvedic"');
  }
  if (!supabase) throw new Error('Database connection is unavailable.');

  const { error: updateError } = await supabase
    .from('doctors')
    .update({ treatment_method: newMethod, updated_at: new Date().toISOString() })
    .eq('id', doctorId);

  if (updateError) {
    throw new Error(`recordMethodChange: failed to update doctor: ${updateError.message}`);
  }

  const { error: auditError } = await supabase
    .from('doctor_method_changes')
    .insert({ doctor_id: doctorId, old_method: oldMethod || null, new_method: newMethod, changed_by: changedBy });

  if (auditError) {
    throw new Error(`recordMethodChange: failed to write audit row: ${auditError.message}`);
  }
}
