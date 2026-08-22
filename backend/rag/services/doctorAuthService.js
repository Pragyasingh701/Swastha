// Doctor -> patient authorization check, mirroring
// backend/db/doctorPatients.js's isDoctorLinkedToPatient. Duplicated
// rather than imported because rag/ is intentionally a separate service
// (own process/port/.env, see rag/README.md) with no dependency on
// backend/'s source tree — it only shares the same Supabase project.
import { supabase } from '../config/supabase.js';

/**
 * True only if a doctor_patient link row exists AND is 'accepted' for this
 * doctor+patient pair. This is the sole gate that lets a doctor's JWT read
 * a DIFFERENT user's report_embeddings/reports via Ask Swastha — without
 * an accepted link, a doctor can only ever search their own data
 * (id === req.user.userId).
 *
 * status = 'accepted' is required, not just "a row exists" — a pending
 * link means the patient hasn't approved the doctor yet, so no health
 * data (including via search) may be exposed, matching
 * backend/db/doctorPatients.js's isDoctorLinkedToPatient exactly.
 */
export async function isDoctorLinkedToPatient(doctorId, patientUserId) {
  if (!doctorId || !patientUserId) return false;

  const { data, error } = await supabase
    .from('doctor_patient')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientUserId)
    .eq('status', 'accepted')
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`isDoctorLinkedToPatient: lookup failed: ${error.message}`);
  }

  return Boolean(data);
}
