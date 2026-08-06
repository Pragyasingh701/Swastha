import supabase from '../config/supabase.js';

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
  const name = userData.name || userData.fullName || existingUser?.name || normalizedEmail.split('@')[0];
  const picture = userData.picture || existingUser?.picture || null;
  const passwordHash = userData.password || existingUser?.password_hash || null;
  
  // Preserve existing established role ('patient' or 'doctor') if new role is null/undefined/'none'
  const existingRole = existingUser?.role && existingUser.role !== 'none' ? existingUser.role : null;
  const newRole = (userData.role && userData.role !== 'none') ? userData.role : null;
  const role = newRole || existingRole || (userData.role === 'none' ? 'none' : null);
  const hasSelectedRole = !!(role && role !== 'none');

  const authProvider = userData.authProvider || existingUser?.authProvider || existingUser?.auth_provider || 'email';
  const phone = userData.phone || userData.mobile || existingUser?.phone || existingUser?.mobile || null;
  const dob = userData.dob || existingUser?.dob || null;
  const bloodGroup = userData.bloodGroup || userData.blood_group || existingUser?.bloodGroup || existingUser?.blood_group || null;
  const specialty = userData.specialization || userData.specialty || existingUser?.specialty || existingUser?.specialization || null;
  const licenseNumber = userData.regNumber || userData.licenseNumber || userData.license_number || existingUser?.license_number || existingUser?.licenseNumber || null;
  const council = userData.council || existingUser?.council || null;
  const degree = userData.degree || existingUser?.degree || null;
  const experience = userData.experience !== undefined ? userData.experience : (existingUser?.experience || null);
  const hospitalName = userData.hospitalName || userData.hospital_name || existingUser?.hospitalName || existingUser?.hospital_name || null;
  const address = userData.address || userData.hospital_address || existingUser?.address || existingUser?.hospital_address || null;
  const regCertificateUrl = userData.regCertificateUrl || userData.reg_certificate_url || userData.certificateUrl || userData.certificate_url || existingUser?.reg_certificate_url || null;
  const idProofUrl = userData.idProofUrl || userData.id_proof_url || userData.idProof || userData.id_proof || existingUser?.id_proof_url || null;
  const consultationFee = userData.consultationFee || userData.consultation_fee || existingUser?.consultation_fee || null;
  const bio = userData.bio || existingUser?.bio || null;

  const certExtractedData = userData.certExtractedData || userData.cert_extracted_data || existingUser?.cert_extracted_data || null;
  const licenseExpiryDate = userData.licenseExpiryDate || userData.license_expiry_date || existingUser?.license_expiry_date || null;
  const verificationStatus = userData.verificationStatus || userData.verification_status || existingUser?.verification_status || 'pending';

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
    dob,
    bloodGroup,
    blood_group: bloodGroup,
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
    id_proof_url: idProofUrl,
    idProofUrl,
    cert_extracted_data: certExtractedData,
    certExtractedData,
    license_expiry_date: licenseExpiryDate,
    licenseExpiryDate,
    verification_status: verificationStatus,
    verificationStatus,
    consultation_fee: consultationFee,
    consultationFee,
    bio,
    created_at: existingUser?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const fullPayload = {
        id: userId,
        email: normalizedEmail,
        name,
        picture,
        password_hash: passwordHash,
        role,
        auth_provider: authProvider,
        phone,
        dob,
        blood_group: bloodGroup,
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

      const { data, error } = await supabase
        .from('users')
        .upsert(fullPayload)
        .select();

      if (!error && data && data.length > 0) {
        const userRow = data[0];
        console.log(`⚡ [Supabase] Unique user record updated in database: ${normalizedEmail}`);
        savedUser = { ...savedUser, ...userRow, hasSelectedRole: !!(userRow.role && userRow.role !== 'none') };
      } else if (error) {
        console.warn('Supabase upsert notice:', error.message);
      }
    } catch (err) {
      console.warn('Supabase upsert warning:', err.message);
    }
  }

  console.log(`💾 [Database] Unique user active for: ${savedUser.email} (ID: ${savedUser.id}, Role: ${savedUser.role || 'Unselected'})`);
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
    await supabase.from('users').update({ role, updated_at: new Date().toISOString() }).eq('id', targetId);
  } catch (e) {
    console.warn('Supabase updateUserRole warning:', e.message);
  }
};

/**
 * Update User Password in Supabase
 */
export const updateUserPassword = async (email, newPassword) => {
  if (!email || !newPassword || !supabase) return;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: newPassword, updated_at: new Date().toISOString() })
      .eq('email', normalizedEmail);

    if (!error) {
      console.log(`⚡ [Supabase] Password successfully updated in DB for: ${normalizedEmail}`);
    } else {
      console.warn('Supabase updateUserPassword error:', error.message);
    }
  } catch (err) {
    console.warn('Supabase updateUserPassword warning:', err.message);
  }
};
