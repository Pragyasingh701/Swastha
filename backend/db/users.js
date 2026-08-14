import supabase from '../config/supabase.js';

function generatePatientCode() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

async function generateUniquePatientCode() {
  if (!supabase) {
    return generatePatientCode();
  }

  let attempts = 0;
  while (attempts < 10) {
    const candidate = generatePatientCode();
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('patient_code', candidate)
      .maybeSingle();

    if (!error && !data) {
      return candidate;
    }

    attempts += 1;
  }

  return generatePatientCode();
}

/**
 * Find user by email from Supabase
 */
export const findUserByEmail = async (email) => {
  if (!email || !supabase) return null;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase query notice:', err.message);
  }

  return null;
};

/**
 * Find user by patient code from Supabase
 */
export const findUserByPatientCode = async (patientCode) => {
  if (!patientCode || !supabase) return null;
  const normalizedCode = String(patientCode).trim();

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('patient_code', normalizedCode)
      .maybeSingle();

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase patient code query notice:', err.message);
  }

  return null;
};

/**
 * Find user by ID from Supabase
 */
export const findUserById = async (id) => {
  if (!id || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!error && data) return data;
  } catch (err) {
    console.warn('Supabase findUserById notice:', err.message);
  }

  return null;
};

/**
 * Create or Update User in Supabase
 */
export const createOrUpdateUser = async (userData) => {
  if (!userData?.email) throw new Error('Email is required to save user');
  const normalizedEmail = userData.email.toLowerCase().trim();

  const existingUser = await findUserByEmail(normalizedEmail);

  const userId = existingUser ? existingUser.id : (userData.id || 'usr_' + Date.now());

  // Explicit role selection handling
  const role = (userData.role !== undefined && userData.role !== null && userData.role !== '')
    ? userData.role
    : (existingUser?.role ?? 'none');
  const hasSelectedRole = !!(role && role !== 'none');
  const isDoctor = role === 'doctor';

  // Priority extraction: new userData parameters ALWAYS override existing database values
  const name = (userData.name !== undefined && userData.name !== null && userData.name !== '')
    ? userData.name
    : (userData.fullName !== undefined && userData.fullName !== null && userData.fullName !== '')
    ? userData.fullName
    : (existingUser?.name || existingUser?.fullName || normalizedEmail.split('@')[0]);

  const picture = userData.picture || existingUser?.picture || null;
  const passwordHash = userData.password || existingUser?.password_hash || null;
  const authProvider = userData.authProvider || userData.auth_provider || existingUser?.authProvider || existingUser?.auth_provider || 'email';

  const phone = (userData.phone !== undefined && userData.phone !== null && userData.phone !== '')
    ? userData.phone
    : (userData.mobile !== undefined && userData.mobile !== null && userData.mobile !== '')
    ? userData.mobile
    : (userData.phone_number !== undefined && userData.phone_number !== null && userData.phone_number !== '')
    ? userData.phone_number
    : (existingUser?.phone || existingUser?.mobile || existingUser?.phone_number || null);

  const patientCode = (userData.patientCode !== undefined && userData.patientCode !== null && userData.patientCode !== '')
    ? userData.patientCode
    : (userData.patient_code !== undefined && userData.patient_code !== null && userData.patient_code !== '')
    ? userData.patient_code
    : (existingUser?.patientCode || existingUser?.patient_code || null);

  const resolvedPatientCode = role === 'doctor'
    ? null
    : (role === 'patient' && !patientCode)
      ? await generateUniquePatientCode()
      : patientCode;

  const dob = (userData.dob !== undefined && userData.dob !== null && userData.dob !== '')
    ? userData.dob
    : (userData.dateOfBirth !== undefined && userData.dateOfBirth !== null && userData.dateOfBirth !== '')
    ? userData.dateOfBirth
    : (userData.date_of_birth !== undefined && userData.date_of_birth !== null && userData.date_of_birth !== '')
    ? userData.date_of_birth
    : (existingUser?.dob || existingUser?.date_of_birth || null);

  const bloodGroup = (userData.bloodGroup !== undefined && userData.bloodGroup !== null && userData.bloodGroup !== '')
    ? userData.bloodGroup
    : (userData.blood_group !== undefined && userData.blood_group !== null && userData.blood_group !== '')
    ? userData.blood_group
    : (userData.blood_type !== undefined && userData.blood_type !== null && userData.blood_type !== '')
    ? userData.blood_type
    : (existingUser?.bloodGroup || existingUser?.blood_group || existingUser?.blood_type || null);

  const gender = userData.gender || existingUser?.gender || 'Male';
  const emergencyContact = userData.emergencyContact || userData.emergency_contact || existingUser?.emergencyContact || existingUser?.emergency_contact || null;

  // Doctor-only credentials (explicitly reset to null when role is patient)
  const specialty = isDoctor ? ((userData.specialization !== undefined && userData.specialization !== null && userData.specialization !== '')
    ? userData.specialization
    : (userData.specialty !== undefined && userData.specialty !== null && userData.specialty !== '')
    ? userData.specialty
    : (existingUser?.specialty || existingUser?.specialization || null)) : null;

  const licenseNumber = isDoctor ? ((userData.regNumber !== undefined && userData.regNumber !== null && userData.regNumber !== '')
    ? userData.regNumber
    : (userData.licenseNumber !== undefined && userData.licenseNumber !== null && userData.licenseNumber !== '')
    ? userData.licenseNumber
    : (userData.license_number !== undefined && userData.license_number !== null && userData.license_number !== '')
    ? userData.license_number
    : (existingUser?.license_number || existingUser?.licenseNumber || null)) : null;

  const council = isDoctor ? (userData.council || existingUser?.council || null) : null;
  const degree = isDoctor ? (userData.degree || existingUser?.degree || null) : null;
  const experience = isDoctor ? (userData.experience !== undefined ? userData.experience : (existingUser?.experience || null)) : null;
  const hospitalName = isDoctor ? (userData.hospitalName || userData.hospital_name || existingUser?.hospitalName || existingUser?.hospital_name || null) : null;
  const address = isDoctor ? (userData.address || userData.hospital_address || existingUser?.address || existingUser?.hospital_address || null) : null;
  const regCertificateUrl = isDoctor ? (userData.regCertificateUrl || userData.reg_certificate_url || userData.certificateUrl || userData.certificate_url || existingUser?.reg_certificate_url || null) : null;
  const consultationFee = isDoctor ? (userData.consultationFee || userData.consultation_fee || existingUser?.consultation_fee || null) : null;
  const bio = isDoctor ? (userData.bio || existingUser?.bio || null) : null;

  const certExtractedData = isDoctor ? (userData.certExtractedData || userData.cert_extracted_data || existingUser?.cert_extracted_data || null) : null;
  const licenseExpiryDate = isDoctor ? (userData.licenseExpiryDate || userData.license_expiry_date || existingUser?.license_expiry_date || null) : null;
  const verificationStatus = isDoctor ? (userData.verificationStatus || userData.verification_status || existingUser?.verification_status || 'pending') : 'verified';

  let savedUser = {
    id: userId,
    email: normalizedEmail,
    name,
    fullName: name,
    picture,
    password_hash: passwordHash,
    role,
    hasSelectedRole: !!hasSelectedRole,
    auth_provider: authProvider,
    authProvider,
    phone,
    mobile: phone,
    phone_number: phone,
    patientCode: resolvedPatientCode,
    patient_code: resolvedPatientCode,
    dob,
    dateOfBirth: dob,
    date_of_birth: dob,
    bloodGroup,
    blood_group: bloodGroup,
    gender,
    emergencyContact,
    emergency_contact: emergencyContact,
    specialty,
    specialization: specialty,
    license_number: licenseNumber,
    licenseNumber,
    regNumber: licenseNumber,
    council,
    degree,
    experience,
    hospital_name: hospitalName,
    hospitalName,
    address,
    reg_certificate_url: regCertificateUrl,
    regCertificateUrl,
    cert_extracted_data: certExtractedData,
    certExtractedData,
    license_expiry_date: licenseExpiryDate,
    verification_status: verificationStatus,
    verificationStatus,
    consultationFee,
    bio,
    created_at: existingUser?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const dbPayload = {
        name,
        picture,
        password_hash: passwordHash,
        role,
        auth_provider: authProvider,
        phone,
        patient_code: role === 'patient' ? resolvedPatientCode : null,
        dob,
        blood_group: bloodGroup,
        gender,
        specialty,
        license_number: licenseNumber,
        council,
        degree,
        experience: experience ? parseInt(experience, 10) : null,
        hospital_name: hospitalName,
        address,
        reg_certificate_url: regCertificateUrl,
        cert_extracted_data: certExtractedData,
        license_expiry_date: licenseExpiryDate,
        verification_status: verificationStatus,
        updated_at: new Date().toISOString(),
      };

      // Filter out undefined keys only (preserve explicit NULL values so Supabase resets doctor fields on role switch)
      const cleanDbPayload = Object.fromEntries(
        Object.entries(dbPayload).filter(([_, v]) => v !== undefined)
      );

      let data = null;
      let error = null;

      // 1. If user already exists in DB, perform a clean UPDATE by ID/email
      if (existingUser) {
        const res = await supabase.from('users').update(cleanDbPayload).eq('id', existingUser.id).select();
        if (!res.error && res.data && res.data.length > 0) {
          data = res.data;
        } else {
          const res2 = await supabase.from('users').update(cleanDbPayload).eq('email', normalizedEmail).select();
          if (!res2.error && res2.data && res2.data.length > 0) {
            data = res2.data;
          } else {
            error = res2.error || res.error;
          }
        }
      } else {
        // 2. If new user, UPSERT with id and email
        const newPayload = { id: userId, email: normalizedEmail, ...cleanDbPayload };
        const res = await supabase.from('users').upsert(newPayload).select();
        data = res.data;
        error = res.error;
      }

      if (!error && data && data.length > 0) {
        const userRow = data[0];
        console.log(`⚡ [Supabase] User profile updated in database: ${normalizedEmail} (Role: ${userRow.role}, Specialty: ${userRow.specialty}, License: ${userRow.license_number})`);
        savedUser = {
          ...savedUser,
          ...userRow,
          name: userRow.name || name,
          fullName: userRow.name || name,
          phone: userRow.phone || userRow.mobile || phone,
          mobile: userRow.phone || userRow.mobile || phone,
          patientCode: userRow.patient_code || userRow.patientCode || resolvedPatientCode,
          patient_code: userRow.patient_code || userRow.patientCode || resolvedPatientCode,
          dob: userRow.dob || dob,
          bloodGroup: userRow.blood_group || bloodGroup,
          blood_group: userRow.blood_group || bloodGroup,
          gender: userRow.gender || gender,
          hasSelectedRole: !!(userRow.role && userRow.role !== 'none'),
        };
      } else if (error) {
        console.error('❌ [Supabase] Error updating user in database:', error.message);
      }
    } catch (err) {
      console.error('❌ [Supabase] Exception during user save:', err.message);
    }
  }

  return savedUser;
};

/**
 * Update User Role
 */
export const updateUserRole = async (userIdOrEmail, role) => {
  if (!userIdOrEmail || !supabase) return;

  const existingUser = (await findUserById(userIdOrEmail)) || (await findUserByEmail(userIdOrEmail));
  const targetId = existingUser ? existingUser.id : userIdOrEmail;

  try {
    const nextPatientCode = role === 'doctor'
      ? null
      : (role === 'patient' && !existingUser?.patient_code)
        ? await generateUniquePatientCode()
        : existingUser?.patient_code || null;

    await supabase.from('users').update({
      role,
      patient_code: nextPatientCode,
      specialty: role === 'doctor' ? existingUser?.specialty : null,
      license_number: role === 'doctor' ? existingUser?.license_number : null,
      council: role === 'doctor' ? existingUser?.council : null,
      degree: role === 'doctor' ? existingUser?.degree : null,
      experience: role === 'doctor' ? existingUser?.experience : null,
      hospital_name: role === 'doctor' ? existingUser?.hospital_name : null,
      address: role === 'doctor' ? existingUser?.address : null,
      reg_certificate_url: role === 'doctor' ? existingUser?.reg_certificate_url : null,
      cert_extracted_data: role === 'doctor' ? existingUser?.cert_extracted_data : null,
      license_expiry_date: role === 'doctor' ? existingUser?.license_expiry_date : null,
      verification_status: role === 'doctor' ? (existingUser?.verification_status || 'pending') : 'verified',
      updated_at: new Date().toISOString()
    }).eq('id', targetId);
  } catch (e) {
    console.warn('Supabase updateUserRole warning:', e.message);
  }
};

/**
 * Delete a user row by ID from Supabase
 */
export const deleteUserById = async (id) => {
  if (!id || !supabase) return false;

  try {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      throw error;
    }
    return true;
  } catch (e) {
    console.warn('Supabase deleteUserById warning:', e.message);
    return false;
  }
};

/**
 * Update User Password in Supabase
 */
export const updateUserPassword = async (email, newPassword) => {
  if (!email || !newPassword || !supabase) return;

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await findUserByEmail(normalizedEmail);
  if (!existingUser) return;

  try {
    await supabase.from('users').update({ password_hash: newPassword, updated_at: new Date().toISOString() }).eq('id', existingUser.id);
  } catch (e) {
    console.warn('Supabase updateUserPassword warning:', e.message);
  }
};
