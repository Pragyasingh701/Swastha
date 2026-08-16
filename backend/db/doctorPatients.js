import supabase from '../config/supabase.js';

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
    status: 'Active',
    statusTone: 'bg-emerald-100 text-emerald-800',
    avatar: patient.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
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

        const { data: patient, error: patientError } = await supabase
          .from('users')
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
        };
      })
    );

    return patientRecords.filter(Boolean);
  } catch (error) {
    console.warn('Doctor patient fetch warning:', error?.message || error);
    return [];
  }
};

export const linkDoctorToPatient = async ({ doctorId, patientUserId }) => {
  if (!doctorId || !patientUserId) {
    throw new Error('Doctor ID and patient ID are required.');
  }

  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  const normalizedPatientId = String(patientUserId).trim();
  if (!normalizedPatientId) {
    throw new Error('Patient ID is required.');
  }

  let patient = null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`id.eq.${normalizedPatientId},patient_code.eq.${normalizedPatientId}`)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    patient = data;
  } catch (error) {
    console.warn('Doctor patient lookup warning:', error?.message || error);
    throw new Error('Unable to verify the patient ID at the moment.');
  }

  if (!patient) {
    throw new Error('No patient user found with this ID.');
  }

  if ((patient.role || '').toLowerCase() !== 'patient') {
    throw new Error('This user is not registered as a patient.');
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
    return {
      link: existingLink,
      patient: normalizeDoctorPatientCard(patient),
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
    patient: normalizeDoctorPatientCard(patient),
  };
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
