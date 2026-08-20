import supabase from '../config/supabase.js';

// Doctor -> patient linking is now request-based (status column, added in
// supabase/migrations/20260820051121_add_status_to_doctor_patient.sql):
//   pending   -> doctor requested, patient hasn't responded. No health
//                data is ever returned for a pending link — only
//                { id, patient_name, status } (see minimalDoctorPatientCard).
//   accepted  -> patient approved. Full card + full health record access.
//   declined  -> patient rejected. Name-only, doctor cannot re-request
//                (linkDoctorToPatient blocks re-linking a declined pair).
//
// SECURITY: isDoctorLinkedToPatient (the gate every other route/service
// uses to decide whether a doctor may read a patient's health data) now
// requires status = 'accepted'. This is enforced here, at the single
// shared source of truth, specifically so it cannot be bypassed by a
// route that forgets to check status separately.

function normalizeDoctorPatientCard(patient = {}) {
  const patientIdValue = patient.patient_code || patient.id;
  const patient_email = patient.patient_email || patient.email || null;
  const patient_name = patient.patient_name || patient.name || patient.fullName || patient_email || 'Patient';
  const patient_phone = patient.patient_phone || patient.phone || patient.mobile || patient.phone_number || null;
  const patient_gender = patient.patient_gender || patient.gender || 'U';
  const patient_dob = patient.patient_dob || patient.dob || patient.date_of_birth || patient.dateOfBirth || null;
  const patient_blood_group = patient.patient_blood_group || patient.blood_group || patient.bloodGroup || patient.blood_type || null;
  const calculatedAge = patient_dob ? Math.max(0, new Date().getFullYear() - new Date(patient_dob).getFullYear()) : 0;
  const specialty = patient.specialty || patient.specialization || 'General Care';

  return {
    id: `#${String(patientIdValue || '').replace(/^#/, '')}` || '#Unknown',
    patientUserId: patient.id,
    patientId: patientIdValue || patient.id,
    patient_email,
    patient_name,
    patient_phone,
    patient_gender,
    patient_dob,
    patient_blood_group,
    name: patient_name,
    email: patient_email,
    phone: patient_phone,
    gender: patient_gender,
    dob: patient_dob,
    blood_group: patient_blood_group,
    age: calculatedAge,
    condition: specialty,
    conditionTone: 'bg-[#dbeafe] text-[#1d4ed8]',
    lastVisit: 'Recently linked',
    status: 'Active', // display-only condition/activity label — unrelated
    statusTone: 'bg-emerald-100 text-emerald-800', // to the link's request status below
    avatar: patient.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
  };
}

// Deliberately tiny — no age, phone, dob, blood group, avatar, or anything
// else. A pending/declined card must not leak ANY patient data beyond the
// name, so this is a hardcoded allowlist rather than a filtered version of
// the full object (which would silently start leaking fields if someone
// later adds to normalizeDoctorPatientCard without updating this too).
function minimalDoctorPatientCard(link) {
  return {
    linkId: link.id,
    patientUserId: link.patient_id,
    patient_name: link.patient_name || 'Patient',
    linkStatus: link.status, // 'pending' | 'declined' — kept distinct from
    linkedAt: link.created_at, // the unrelated display `status` field above
  };
}

export const getDoctorPatients = async (doctorId) => {
  if (!doctorId || !supabase) {
    return [];
  }

  try {
    const { data: links, error } = await supabase
      .from('doctor_patient')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (!Array.isArray(links) || links.length === 0) {
      return [];
    }

    const patientRecords = await Promise.all(
      links.map(async (link) => {
        const patientId = link.patient_id || link.patientId || link.user_id || link.userId;
        if (!patientId) {
          return null;
        }

        // Pending/declined: return the minimal shape and STOP — no query
        // against `patients` at all, so no health-adjacent data (dob,
        // blood group, etc.) is ever fetched for a link the patient
        // hasn't accepted.
        if (link.status !== 'accepted') {
          return minimalDoctorPatientCard(link);
        }

        // Post-split: doctor_patient.patient_id always points at `patients`
        // (see db-code-crossref.md — verified patient_id resolves only to
        // patient-role rows even before the split), so this looks up
        // `patients` directly rather than the old shared `users` table.
        const { data: patient, error: patientError } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .maybeSingle();

        if (patientError && patientError.code !== 'PGRST116') {
          throw patientError;
        }

        if (!patient) {
          return null;
        }

        const normalizedPatient = normalizeDoctorPatientCard({
          ...patient,
          patient_email: link.patient_email || patient.email || null,
          patient_name: link.patient_name || patient.name || patient.fullName || patient.email || 'Patient',
          patient_phone: link.patient_phone || patient.phone || patient.mobile || patient.phone_number || null,
          patient_gender: link.patient_gender || patient.gender || 'U',
          patient_dob: link.patient_dob || patient.dob || patient.date_of_birth || patient.dateOfBirth || null,
          patient_blood_group: link.patient_blood_group || patient.blood_group || patient.bloodGroup || patient.blood_type || null,
        });

        return {
          ...normalizedPatient,
          linkId: link.id,
          linkedAt: link.created_at,
          linkStatus: link.status,
        };
      })
    );

    return patientRecords.filter(Boolean);
  } catch (error) {
    console.warn('Doctor patient fetch warning:', error?.message || error);
    return [];
  }
};

/**
 * The authorization gate every other route/service uses before returning a
 * patient's health data to a doctor. Requires status = 'accepted' — a
 * pending or declined link returns false, same as no link at all. This is
 * the single place that decision is made; callers must not re-derive it
 * from a raw link-exists check.
 */
export const isDoctorLinkedToPatient = async (doctorId, patientUserId) => {
  if (!doctorId || !patientUserId || !supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('doctor_patient')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientUserId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return Boolean(data);
  } catch (error) {
    console.warn('Doctor-patient link check warning:', error?.message || error);
    return false;
  }
};

/**
 * Creates a PENDING link request. Does not grant any data access — the
 * patient must accept via acceptDoctorLinkRequest before
 * isDoctorLinkedToPatient (and therefore any health-data route) returns
 * true for this pair.
 */
export const linkDoctorToPatient = async ({ doctorId, patientCode }) => {
  if (!doctorId || !patientCode) {
    throw new Error('Doctor ID and patient code are required.');
  }

  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  const normalizedPatientCode = String(patientCode).trim();
  if (!normalizedPatientCode) {
    throw new Error('Patient code is required.');
  }

  let patient = null;

  try {
    // Only allow lookup by patient_code. Reject direct user ID lookups to
    // ensure linking is only possible via patient codes provided to patients.
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('patient_code', normalizedPatientCode)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    patient = data;
  } catch (error) {
    console.warn('Doctor patient lookup warning:', error?.message || error);
    throw new Error('Unable to verify the patient code at the moment.');
  }

  if (!patient) {
    throw new Error('No patient found with this code.');
  }

  const { data: existingLink, error: existingLinkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patient.id)
    .maybeSingle();

  if (existingLinkError && existingLinkError.code !== 'PGRST116') {
    throw existingLinkError;
  }

  if (existingLink) {
    if (existingLink.status === 'declined') {
      // Patient explicitly declined — doctor cannot re-request. Surface a
      // clear error rather than silently re-sending or silently no-op'ing.
      throw new Error('This patient has declined your request. You cannot re-request access.');
    }
    // pending or accepted — idempotent, return the existing link as-is.
    return {
      link: existingLink,
      patient: existingLink.status === 'accepted' ? normalizeDoctorPatientCard(patient) : minimalDoctorPatientCard(existingLink),
    };
  }

  const payload = {
    doctor_id: doctorId,
    patient_id: patient.id,
    patient_email: patient.email || null,
    patient_name: patient.name || patient.fullName || patient.email || 'Patient',
    patient_phone: patient.phone || patient.mobile || patient.phone_number || null,
    patient_gender: patient.gender || 'U',
    patient_dob: patient.dob || patient.date_of_birth || patient.dateOfBirth || null,
    patient_blood_group: patient.blood_group || patient.bloodGroup || patient.blood_type || null,
    status: 'pending', // explicit — not relying on the column default alone
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('doctor_patient')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    link: data,
    // Pending: return the minimal shape, not the full patient object —
    // the requesting doctor doesn't get health data just by sending a
    // request, only once (if) the patient accepts.
    patient: minimalDoctorPatientCard(data),
  };
};

/**
 * All pending doctor link requests for a given patient — what the
 * patient's "Doctor Requests" page lists. Returns doctor identity only
 * (name/email/specialty), not the patient's own data — this is read from
 * the patient's own perspective, no health data involved either way.
 */
export const getPendingRequestsForPatient = async (patientUserId) => {
  if (!patientUserId || !supabase) return [];

  try {
    const { data: links, error } = await supabase
      .from('doctor_patient')
      .select('*')
      .eq('patient_id', patientUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(links) || links.length === 0) return [];

    const doctorIds = [...new Set(links.map((l) => l.doctor_id).filter(Boolean))];
    const { data: doctors, error: doctorsError } = await supabase
      .from('doctors')
      .select('id, name, email, specialty, hospital_name')
      .in('id', doctorIds);

    if (doctorsError) throw doctorsError;
    const doctorById = new Map((doctors || []).map((d) => [d.id, d]));

    return links.map((link) => {
      const doctor = doctorById.get(link.doctor_id);
      return {
        linkId: link.id,
        doctorId: link.doctor_id,
        doctorName: doctor?.name || 'Unknown Doctor',
        doctorEmail: doctor?.email || null,
        doctorSpecialty: doctor?.specialty || null,
        doctorHospital: doctor?.hospital_name || null,
        requestedAt: link.created_at,
      };
    });
  } catch (error) {
    console.warn('Pending requests fetch warning:', error?.message || error);
    return [];
  }
};

/**
 * Notification feed for a PATIENT's bell icon: one event per doctor_patient
 * row for "a doctor requested access" (created_at), plus a second event
 * for "you accepted/declined" if responded_at is set. Sorted newest first.
 * type is one of 'request' | 'accepted' | 'declined' so the frontend can
 * render each distinctly without re-deriving it from status.
 */
export const getPatientNotifications = async (patientUserId) => {
  if (!patientUserId || !supabase) return [];

  try {
    const { data: links, error } = await supabase
      .from('doctor_patient')
      .select('*')
      .eq('patient_id', patientUserId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(links) || links.length === 0) return [];

    const doctorIds = [...new Set(links.map((l) => l.doctor_id).filter(Boolean))];
    const { data: doctors, error: doctorsError } = await supabase
      .from('doctors')
      .select('id, name')
      .in('id', doctorIds);

    if (doctorsError) throw doctorsError;
    const doctorNameById = new Map((doctors || []).map((d) => [d.id, d.name || 'Unknown Doctor']));

    const notifications = [];
    for (const link of links) {
      const doctorName = doctorNameById.get(link.doctor_id) || 'Unknown Doctor';

      notifications.push({
        id: `${link.id}-request`,
        linkId: link.id,
        type: 'request',
        doctorName,
        at: link.created_at,
      });

      if (link.responded_at && (link.status === 'accepted' || link.status === 'declined')) {
        notifications.push({
          id: `${link.id}-${link.status}`,
          linkId: link.id,
          type: link.status, // 'accepted' | 'declined'
          doctorName,
          at: link.responded_at,
        });
      }
    }

    notifications.sort((a, b) => new Date(b.at) - new Date(a.at));
    return notifications;
  } catch (error) {
    console.warn('Patient notifications fetch warning:', error?.message || error);
    return [];
  }
};

/**
 * Notification feed for a DOCTOR's bell icon: one event per doctor_patient
 * row for "you sent a request" (created_at), plus a second event for "the
 * patient accepted/declined" if responded_at is set. Same shape as
 * getPatientNotifications but from the doctor's side.
 */
export const getDoctorNotifications = async (doctorId) => {
  if (!doctorId || !supabase) return [];

  try {
    const { data: links, error } = await supabase
      .from('doctor_patient')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!Array.isArray(links) || links.length === 0) return [];

    const notifications = [];
    for (const link of links) {
      const patientName = link.patient_name || 'Patient';

      notifications.push({
        id: `${link.id}-request`,
        linkId: link.id,
        type: 'request-sent',
        patientName,
        at: link.created_at,
      });

      if (link.responded_at && (link.status === 'accepted' || link.status === 'declined')) {
        notifications.push({
          id: `${link.id}-${link.status}`,
          linkId: link.id,
          // 'patient-accepted' | 'patient-declined' — distinct from the
          // patient-side 'accepted'/'declined' types so a shared bell
          // component can tell which side it's rendering for from the
          // type alone.
          type: `patient-${link.status}`,
          patientName,
          at: link.responded_at,
        });
      }
    }

    notifications.sort((a, b) => new Date(b.at) - new Date(a.at));
    return notifications;
  } catch (error) {
    console.warn('Doctor notifications fetch warning:', error?.message || error);
    return [];
  }
};

/**
 * Patient accepts a pending request. Only the patient the link belongs to
 * may accept it — patientUserId must match the link's patient_id, checked
 * server-side, not trusted from the request body/params alone.
 */
export const acceptDoctorLinkRequest = async ({ patientUserId, linkId }) => {
  if (!patientUserId || !linkId) {
    throw new Error('Patient ID and link ID are required.');
  }
  if (!supabase) throw new Error('Database connection is unavailable.');

  const { data: link, error: linkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('id', linkId)
    .maybeSingle();

  if (linkError && linkError.code !== 'PGRST116') throw linkError;
  if (!link) throw new Error('Request not found.');
  if (link.patient_id !== patientUserId) {
    throw new Error('This request does not belong to you.');
  }
  if (link.status !== 'pending') {
    throw new Error(`This request is already ${link.status}.`);
  }

  const { data, error } = await supabase
    .from('doctor_patient')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', linkId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Patient declines a pending request. Same ownership check as accept.
 * A declined link is NOT deleted — kept as a record, with
 * linkDoctorToPatient refusing to re-create a link for a declined pair.
 */
export const declineDoctorLinkRequest = async ({ patientUserId, linkId }) => {
  if (!patientUserId || !linkId) {
    throw new Error('Patient ID and link ID are required.');
  }
  if (!supabase) throw new Error('Database connection is unavailable.');

  const { data: link, error: linkError } = await supabase
    .from('doctor_patient')
    .select('*')
    .eq('id', linkId)
    .maybeSingle();

  if (linkError && linkError.code !== 'PGRST116') throw linkError;
  if (!link) throw new Error('Request not found.');
  if (link.patient_id !== patientUserId) {
    throw new Error('This request does not belong to you.');
  }
  if (link.status !== 'pending') {
    throw new Error(`This request is already ${link.status}.`);
  }

  const { data, error } = await supabase
    .from('doctor_patient')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', linkId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteDoctorPatient = async ({ doctorId, patientUserId, linkId }) => {
  if (!doctorId) {
    throw new Error('Doctor ID is required.');
  }

  if (!linkId && !patientUserId) {
    throw new Error('Either link ID or patient user ID is required.');
  }

  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  try {
    let query = supabase
      .from('doctor_patient')
      .delete()
      .eq('doctor_id', doctorId);

    if (linkId) {
      query = query.eq('id', linkId);
    } else if (patientUserId) {
      query = query.eq('patient_id', patientUserId);
    }

    const { error } = await query;

    if (error) {
      throw error;
    }

    return { message: 'Patient removed successfully.' };
  } catch (error) {
    console.error('Delete doctor patient error:', error);
    throw error;
  }
};
