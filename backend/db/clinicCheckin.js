import crypto from 'crypto';
import supabase from '../config/supabase.js';

// Clinic check-in flow (PRD §3) — walk-in patients read a doctor-specific
// code displayed at the clinic instead of following a remote intake link.
// This module owns the code lifecycle (lazy daily generation, public
// lookup). Ownership/auth decisions stay in the route layer
// (backend/routes/clinic.js), same boundary as doctorPatients.js not
// deciding auth for its callers.

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

// The clinic's day is a calendar day in ONE time zone, so the code changes at the same moment
// for the doctor's wall display and for the patient entering it. It used to be the server's UTC
// date while the display refreshed at the browser's local midnight, so in India a displayed code
// went stale for 5.5 hours every day. Set CLINIC_TIMEZONE for another country; the default is IST.
const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Kolkata';

// Today's date in the clinic's time zone as a plain 'YYYY-MM-DD' string (matches the `date` column
// type in clinic_checkin_codes.valid_date).
export function todayDateString(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// The moment today's code stops being valid: the next midnight in the clinic's time zone, as an ISO
// string, so a screen can refresh exactly then instead of guessing from its own clock.
export function codeValidUntil(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const msSinceMidnight = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() + (24 * 60 * 60 * 1000 - msSinceMidnight)).toISOString();
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
  // nothing else from the doctors row.
  return {
    doctorId: doctor.id,
    doctorName: doctor.name || 'Doctor',
    clinicName: doctor.hospital_name || null,
  };
}
