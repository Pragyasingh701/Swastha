import supabase from '../config/supabase.js';
import { findUserById } from './users.js';

const TABLE_NAME = process.env.PATIENT_PROFILES_TABLE_NAME || 'patient_profiles';

function normalizePatientProfile(row) {
  if (!row) return null;

  const fullName = row.full_name || row.fullName || row.name || null;
  const bloodGroup = row.blood_group || row.bloodGroup || null;
  const patientCode = row.patient_code || row.patientCode || null;
  const phoneValue = row.phone || row.mobile || row.phone_number || null;
  const extPhone = row.emergency_contact_phone || row.emergencyContactPhone || null;
  const notes = row.medical_notes || row.medicalNotes || row.notes || null;
  const lastVisit = row.last_visit_at || row.lastVisitAt || row.last_visit || null;
  const createdAt = row.created_at || row.createdAt || null;
  const updatedAt = row.updated_at || row.updatedAt || null;

  return {
    id: row.id,
    user_id: row.user_id || row.userId || null,
    patient_code: patientCode,
    full_name: fullName,
    name: fullName,
    dob: row.dob || row.date_of_birth || row.dateOfBirth || null,
    gender: row.gender || null,
    blood_group: bloodGroup,
    phone: phoneValue,
    emergency_contact: row.emergency_contact || row.emergencyContact || null,
    emergency_contact_phone: extPhone,
    allergies: Array.isArray(row.allergies) ? row.allergies : [],
    chronic_conditions: Array.isArray(row.chronic_conditions) ? row.chronic_conditions : (Array.isArray(row.chronicConditions) ? row.chronicConditions : []),
    current_medications: Array.isArray(row.current_medications) ? row.current_medications : (Array.isArray(row.currentMedications) ? row.currentMedications : []),
    medical_notes: notes,
    preferred_language: row.preferred_language || row.preferredLanguage || 'English',
    last_visit_at: lastVisit,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function queryPatientProfilesWithFallback(selectQueryBuilder) {
  try {
    const { data, error } = await selectQueryBuilder();
    if (error) throw error;
    return data || [];
  } catch (err) {
    const message = String(err?.message || '');
    if (!/column .* does not exist|does not exist|invalid input syntax/i.test(message)) {
      throw err;
    }

    const { data, error } = await supabase.from(TABLE_NAME).select('*');
    if (error) throw error;
    return data || [];
  }
}

export const listPatientProfiles = async () => {
  if (!supabase) return [];

  try {
    const data = await queryPatientProfilesWithFallback(async () =>
      supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: false })
    );

    const rows = (data || []).map(normalizePatientProfile);
    const enriched = await Promise.all(rows.map(async (profile) => {
      if (!profile?.user_id) return profile;
      const user = await findUserById(profile.user_id);
      return {
        ...profile,
        email: user?.email || null,
        user_email: user?.email || null,
        name: user?.name || profile.full_name || profile.name || null,
        role: user?.role || 'patient',
        patient_code: profile.patient_code || user?.patient_code || null,
      };
    }));

    return enriched;
  } catch (err) {
    console.warn('Supabase listPatientProfiles warning:', err.message);
    return [];
  }
};

export const getPatientProfileByUserId = async (userId) => {
  if (!userId || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return normalizePatientProfile(data || null);
  } catch (err) {
    console.warn('Supabase getPatientProfileByUserId warning:', err.message);
    return null;
  }
};

export const getPatientProfileByPatientCode = async (patientCode) => {
  if (!patientCode || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('patient_code', String(patientCode).trim())
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return normalizePatientProfile(data || null);
  } catch (err) {
    console.warn('Supabase getPatientProfileByPatientCode warning:', err.message);
    return null;
  }
};

function buildPatientPayload(profileData = {}) {
  const now = new Date().toISOString();
  const userId = profileData.user_id || profileData.userId;
  const patientCode = profileData.patient_code || profileData.patientCode || null;
  const fullName = profileData.full_name || profileData.fullName || profileData.name || null;
  const phoneValue = profileData.phone || profileData.mobile || profileData.phone_number || null;
  const bloodGroup = profileData.blood_group || profileData.bloodGroup || null;
  const emergencyContact = profileData.emergency_contact || profileData.emergencyContact || null;
  const emergencyContactPhone = profileData.emergency_contact_phone || profileData.emergencyContactPhone || null;
  const medicalNotes = profileData.medical_notes || profileData.medicalNotes || profileData.notes || null;

  return {
    user_id: String(userId).trim(),
    patient_code: patientCode ? String(patientCode).trim() : null,
    full_name: fullName ? String(fullName).trim() : null,
    dob: profileData.dob || profileData.date_of_birth || profileData.dateOfBirth || null,
    gender: profileData.gender || null,
    blood_group: bloodGroup ? String(bloodGroup).trim() : null,
    phone: phoneValue ? String(phoneValue).trim() : null,
    emergency_contact: emergencyContact ? String(emergencyContact).trim() : null,
    emergency_contact_phone: emergencyContactPhone ? String(emergencyContactPhone).trim() : null,
    allergies: Array.isArray(profileData.allergies) ? profileData.allergies : [],
    chronic_conditions: Array.isArray(profileData.chronic_conditions)
      ? profileData.chronic_conditions
      : (Array.isArray(profileData.chronicConditions) ? profileData.chronicConditions : []),
    current_medications: Array.isArray(profileData.current_medications)
      ? profileData.current_medications
      : (Array.isArray(profileData.currentMedications) ? profileData.currentMedications : []),
    medical_notes: medicalNotes ? String(medicalNotes).trim() : null,
    preferred_language: profileData.preferred_language || profileData.preferredLanguage || 'English',
    last_visit_at: profileData.last_visit_at || profileData.lastVisitAt || null,
    created_at: now,
    updated_at: now,
  };
}

export const upsertPatientProfile = async (profileData = {}) => {
  if (!supabase) return null;

  const userId = profileData.user_id || profileData.userId;
  if (!userId) return null;

  const payload = buildPatientPayload(profileData);

  try {
    const existing = await getPatientProfileByUserId(String(userId).trim());

    if (existing?.id) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .maybeSingle();

      if (error) throw error;
      return normalizePatientProfile(data || existing);
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return normalizePatientProfile(data);
  } catch (err) {
    console.warn('Supabase upsertPatientProfile warning:', err.message);
    return null;
  }
};

export const deletePatientProfileByUserId = async (userId) => {
  if (!userId || !supabase) return false;

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('user_id', String(userId).trim());

    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Supabase deletePatientProfileByUserId warning:', err.message);
    return false;
  }
};
