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
  const name = userData.name || existingUser?.name || normalizedEmail.split('@')[0];
  const picture = userData.picture || existingUser?.picture || null;
  const passwordHash = userData.password || existingUser?.password_hash || null;
  
  const role = userData.role !== undefined ? userData.role : (existingUser?.role || null);
  const hasSelectedRole = userData.hasSelectedRole !== undefined ? userData.hasSelectedRole : (!!(existingUser && existingUser.role));

  const authProvider = userData.authProvider || existingUser?.authProvider || existingUser?.auth_provider || 'email';
  const specialty = userData.specialty || existingUser?.specialty || null;
  const licenseNumber = userData.licenseNumber || existingUser?.license_number || existingUser?.licenseNumber || null;

  let savedUser = {
    id: userId,
    email: normalizedEmail,
    name,
    picture,
    password_hash: passwordHash,
    role,
    hasSelectedRole: !!hasSelectedRole,
    auth_provider: authProvider,
    authProvider,
    specialty,
    license_number: licenseNumber,
    licenseNumber,
    created_at: existingUser?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const upsertPayload = {
        id: userId,
        email: normalizedEmail,
        name,
        picture,
        password_hash: passwordHash,
        role,
        auth_provider: authProvider,
        specialty,
        license_number: licenseNumber,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('users')
        .upsert(upsertPayload, { onConflict: 'email' })
        .select()
        .single();

      if (!error && data) {
        console.log(`⚡ [Supabase] Unique user record updated in database: ${normalizedEmail}`);
        savedUser = { ...savedUser, ...data, hasSelectedRole: !!(data.role || hasSelectedRole) };
      } else if (error) {
        if (error.code === '42501') {
          console.warn('⚠️ [Supabase RLS Warning] Table "users" has Row Level Security (RLS) enabled. Please run `ALTER TABLE users DISABLE ROW LEVEL SECURITY;` in Supabase SQL Editor or use SUPABASE_SERVICE_ROLE_KEY in backend/.env');
        } else {
          console.warn('Supabase upsert notice:', error.message);
        }
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
