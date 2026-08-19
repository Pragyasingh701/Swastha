import supabase from '../config/supabase.js';

// M4 cutover (Phase 3/4 of the DB reorg): `users` has been split into
// `patients`, `doctors`, and `pending_registrations` (see db-reorg-plan.md).
// Every export below keeps its EXACT name and return shape from before the
// split — this is a single dispatcher, not per-role functions (decision:
// user chose "one dispatcher" to keep all 17 call sites in
// backend/routes/auth.js untouched during the auth-critical cutover).
//
// Table selection is driven by `role`:
//   role === 'patient'         -> public.patients
//   role === 'doctor'          -> public.doctors
//   role is null / 'none' / '' -> public.pending_registrations
//
// updateUserRole() is REMOVED (role switching is no longer supported, per
// user decision). Initial role assignment (pending -> patient/doctor) is
// still supported via createOrUpdateUser() below — that is registration,
// not a switch: a pending_registrations row is deleted and a new row is
// inserted into the target table, once, the first time a role is chosen.
// A user who already has a patients/doctors row keeps their role forever;
// calling createOrUpdateUser with a different role for such a user is a
// no-op on the role (see "role is now immutable" comment below).

const TABLE_BY_ROLE = { patient: 'patients', doctor: 'doctors' };

function tableForRole(role) {
  return TABLE_BY_ROLE[role] || 'pending_registrations';
}

/**
 * Generate a unique 6-digit patient code.
 * patient_code only exists on `patients` now (it was patient-only even in
 * the shared `users` table — see db-code-crossref.md).
 */
export const generatePatientCode = async () => {
  let patientCode;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    patientCode = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');

    try {
      const { data, error } = await supabase
        .from('patients')
        .select('id')
        .eq('patient_code', patientCode)
        .maybeSingle();

      if (!error && !data) {
        isUnique = true;
      }
    } catch (err) {
      console.warn('Error checking patient code uniqueness:', err.message);
    }

    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique patient code after multiple attempts');
  }

  return patientCode;
};

/**
 * Find a user by email, searching patients -> doctors -> pending_registrations.
 * Returns the row exactly as before, PLUS a `role` field (patients/doctors
 * rows don't store `role` as a column anymore — it's implied by which table
 * matched — so it's attached here to keep every caller in auth.js, which
 * reads `.role` off the result, working unchanged).
 */
export const findUserByEmail = async (email) => {
  if (!email || !supabase) return null;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients').select('*').eq('email', normalizedEmail).maybeSingle();
    if (!pErr && patient) return { ...patient, role: 'patient' };

    const { data: doctor, error: dErr } = await supabase
      .from('doctors').select('*').eq('email', normalizedEmail).maybeSingle();
    if (!dErr && doctor) return { ...doctor, role: 'doctor' };

    const { data: pending, error: prErr } = await supabase
      .from('pending_registrations').select('*').eq('email', normalizedEmail).maybeSingle();
    if (!prErr && pending) return { ...pending, role: 'none' };
  } catch (err) {
    console.warn('Supabase query notice:', err.message);
  }

  return null;
};

/**
 * Find a user by ID, searching patients -> doctors -> pending_registrations.
 * Same role-attachment note as findUserByEmail above.
 */
export const findUserById = async (id) => {
  if (!id || !supabase) return null;

  try {
    const { data: patient, error: pErr } = await supabase
      .from('patients').select('*').eq('id', id).maybeSingle();
    if (!pErr && patient) return { ...patient, role: 'patient' };

    const { data: doctor, error: dErr } = await supabase
      .from('doctors').select('*').eq('id', id).maybeSingle();
    if (!dErr && doctor) return { ...doctor, role: 'doctor' };

    const { data: pending, error: prErr } = await supabase
      .from('pending_registrations').select('*').eq('id', id).maybeSingle();
    if (!prErr && pending) return { ...pending, role: 'none' };
  } catch (err) {
    console.warn('Supabase findUserById notice:', err.message);
  }

  return null;
};

/**
 * Look up a user by id OR patient_code. patient_code only exists on
 * `patients`, so that half of the search is patients-only; the id half
 * still checks all three tables (mirrors findUserById, used as a fallback
 * for GET /api/auth/users/:userId in auth.js, which tries findUserById
 * first and only reaches this for a patient_code-style id).
 */
export const findUserByIdOrPatientCode = async (idOrCode) => {
  if (!idOrCode || !supabase) return null;
  const normalized = String(idOrCode).trim();

  const byId = await findUserById(normalized);
  if (byId) return byId;

  try {
    const { data, error } = await supabase
      .from('patients').select('*').eq('patient_code', normalized).maybeSingle();
    if (!error && data) return { ...data, role: 'patient' };
  } catch (err) {
    console.warn('Supabase findUserByIdOrPatientCode notice:', err.message);
  }

  return null;
};

/**
 * Create or update a user's profile. Single dispatcher across
 * patients / doctors / pending_registrations, selected by `role`.
 *
 * Role is now IMMUTABLE once a user has a row in patients or doctors: if
 * existingUser is already in one of those two tables, `role` is forced to
 * existingUser.role regardless of what's passed in, and the write goes to
 * that same table. This is what "no role switching" means in code — the
 * one remaining role transition is pending_registrations -> patients/doctors
 * (first-time selection, not a switch), handled below by deleting the
 * pending row and inserting into the target table.
 */
export const createOrUpdateUser = async (userData) => {
  if (!userData?.email) throw new Error('Email is required to save user');
  const normalizedEmail = userData.email.toLowerCase().trim();

  const existingUser = await findUserByEmail(normalizedEmail);
  const userId = existingUser ? existingUser.id : (userData.id || 'usr_' + Date.now());

  // Role is immutable once assigned (existingUser.role is 'patient' or
  // 'doctor'). Only a pending_registrations user (role 'none'/undefined) or
  // a brand-new user can have their role set by this call.
  const alreadyAssigned = existingUser && existingUser.role !== 'none' && existingUser.role != null;
  const requestedRole = (userData.role !== undefined && userData.role !== null && userData.role !== '')
    ? userData.role
    : (existingUser?.role ?? 'none');
  const role = alreadyAssigned ? existingUser.role : requestedRole;

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

  // Doctor-only credentials (null when role isn't doctor) — same as before the split.
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
  // consultationFee / bio: kept for backward compatibility with callers that
  // pass/read them, but — same as before the split — there is no DB column
  // for either, so they are computed here and returned in savedUser, never
  // written to the database. Pre-existing behaviour (db-code-crossref.md),
  // not introduced by this migration.
  const consultationFee = isDoctor ? (userData.consultationFee || userData.consultation_fee || existingUser?.consultation_fee || null) : null;
  const bio = isDoctor ? (userData.bio || existingUser?.bio || null) : null;

  const certExtractedData = isDoctor ? (userData.certExtractedData || userData.cert_extracted_data || existingUser?.cert_extracted_data || null) : null;
  const licenseExpiryDate = isDoctor ? (userData.licenseExpiryDate || userData.license_expiry_date || existingUser?.license_expiry_date || null) : null;
  const verificationStatus = isDoctor ? (userData.verificationStatus || userData.verification_status || existingUser?.verification_status || 'pending') : 'verified';

  // Generate unique 6-digit patient code for patients (both new and existing)
  let patientCode = existingUser?.patient_code || userData?.patient_code || null;
  if (!isDoctor && role === 'patient' && !patientCode) {
    try {
      patientCode = await generatePatientCode();
      console.log(`✅ Generated patient code: ${patientCode} for user ${normalizedEmail}`);
    } catch (err) {
      console.error('⚠️ Failed to generate patient code:', err.message);
      patientCode = null;
    }
  }

  const nowIso = new Date().toISOString();
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
    dob,
    dateOfBirth: dob,
    date_of_birth: dob,
    bloodGroup,
    blood_group: bloodGroup,
    gender,
    emergencyContact,
    emergency_contact: emergencyContact,
    patient_code: patientCode,
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
    created_at: existingUser?.created_at || nowIso,
    updated_at: nowIso,
  };

  if (supabase) {
    try {
      const targetTable = tableForRole(role);

      // Table-specific payload: `patients` has no doctor columns and vice
      // versa, `pending_registrations` has neither — sending a column that
      // doesn't exist on the target table would error, so each is built
      // separately rather than reusing one flat object with extra keys.
      let dbPayload;
      if (role === 'patient') {
        dbPayload = {
          name, picture, password_hash: passwordHash, auth_provider: authProvider,
          phone, dob, gender, blood_group: bloodGroup, patient_code: patientCode,
          verification_status: verificationStatus, updated_at: nowIso,
        };
      } else if (role === 'doctor') {
        dbPayload = {
          name, picture, password_hash: passwordHash, auth_provider: authProvider,
          phone, dob, gender,
          specialty, license_number: licenseNumber, council, degree,
          experience: experience ? parseInt(experience, 10) : null,
          hospital_name: hospitalName, address, reg_certificate_url: regCertificateUrl,
          cert_extracted_data: certExtractedData, license_expiry_date: licenseExpiryDate,
          verification_status: verificationStatus, updated_at: nowIso,
        };
      } else {
        dbPayload = {
          name, picture, password_hash: passwordHash, auth_provider: authProvider,
          verification_status: verificationStatus, updated_at: nowIso,
        };
      }

      // Preserve explicit NULLs (only strip undefined) — same reasoning as
      // before the split: a doctor-only field explicitly cleared should stay
      // cleared, not be skipped.
      const cleanDbPayload = Object.fromEntries(
        Object.entries(dbPayload).filter(([_, v]) => v !== undefined)
      );

      let data = null;
      let error = null;

      if (existingUser && !alreadyAssigned && hasSelectedRole) {
        // FIRST-TIME role selection out of pending_registrations: this is a
        // one-time promotion, not a role switch. Insert into the target
        // table, then remove the pending row. Order matters — insert first,
        // so a failure leaves the user recoverable in pending_registrations
        // rather than in neither table.
        const newPayload = { id: userId, email: normalizedEmail, ...cleanDbPayload };
        const res = await supabase.from(targetTable).insert(newPayload).select();
        if (!res.error && res.data && res.data.length > 0) {
          data = res.data;
          await supabase.from('pending_registrations').delete().eq('id', userId);
        } else {
          error = res.error;
        }
      } else if (existingUser) {
        // Normal update — role unchanged (either already assigned, or
        // staying in pending_registrations because no role was chosen yet).
        const res = await supabase.from(targetTable).update(cleanDbPayload).eq('id', existingUser.id).select();
        if (!res.error && res.data && res.data.length > 0) {
          data = res.data;
        } else {
          const res2 = await supabase.from(targetTable).update(cleanDbPayload).eq('email', normalizedEmail).select();
          if (!res2.error && res2.data && res2.data.length > 0) {
            data = res2.data;
          } else {
            error = res2.error || res.error;
          }
        }
      } else {
        // Brand-new user.
        const newPayload = { id: userId, email: normalizedEmail, ...cleanDbPayload };
        const res = await supabase.from(targetTable).upsert(newPayload).select();
        data = res.data;
        error = res.error;
      }

      if (!error && data && data.length > 0) {
        const userRow = data[0];
        console.log(`⚡ [Supabase] User profile updated in ${targetTable}: ${normalizedEmail} (Role: ${role}, Specialty: ${userRow.specialty}, License: ${userRow.license_number}, PatientCode: ${userRow.patient_code})`);
        savedUser = {
          ...savedUser,
          ...userRow,
          role, // patients/doctors/pending_registrations rows don't carry a role column — always attach it
          name: userRow.name || name,
          fullName: userRow.name || name,
          phone: userRow.phone || userRow.mobile || phone,
          mobile: userRow.phone || userRow.mobile || phone,
          dob: userRow.dob || dob,
          bloodGroup: userRow.blood_group || bloodGroup,
          blood_group: userRow.blood_group || bloodGroup,
          gender: userRow.gender || gender,
          patient_code: userRow.patient_code || patientCode,
          hasSelectedRole: !!(role && role !== 'none'),
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
 * Delete a user row by ID — checks patients, doctors, and
 * pending_registrations (the id is only in one of the three).
 */
export const deleteUserById = async (id) => {
  if (!id || !supabase) return false;

  try {
    const results = await Promise.all([
      supabase.from('patients').delete().eq('id', id).select(),
      supabase.from('doctors').delete().eq('id', id).select(),
      supabase.from('pending_registrations').delete().eq('id', id).select(),
    ]);

    const anyError = results.find((r) => r.error);
    if (anyError) throw anyError.error;

    return true;
  } catch (e) {
    console.warn('Supabase deleteUserById warning:', e.message);
    return false;
  }
};

/**
 * Update a user's password hash — resolves which table via findUserByEmail
 * (which already searches all three), then writes to that same table.
 */
export const updateUserPassword = async (email, newPassword) => {
  if (!email || !newPassword || !supabase) return;

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await findUserByEmail(normalizedEmail);
  if (!existingUser) return;

  const targetTable = tableForRole(existingUser.role);

  try {
    await supabase.from(targetTable)
      .update({ password_hash: newPassword, updated_at: new Date().toISOString() })
      .eq('id', existingUser.id);
  } catch (e) {
    console.warn('Supabase updateUserPassword warning:', e.message);
  }
};
