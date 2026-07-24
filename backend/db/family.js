import crypto from 'crypto';
import supabase from '../config/supabase.js';

const FAMILY_VAULT_TABLE = process.env.FAMILY_VAULT_TABLE_NAME || 'vault_table';
const FAMILY_MEMBERS_TABLE = process.env.FAMILY_MEMBERS_TABLE_NAME || 'family_members';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPendingAuthorizationMember(member) {
  return member?.authorizationStatus === 'pending' || Boolean(member?.notes && /\[PendingAuthorization:[^\]]+\]/.test(member.notes));
}

function normalizeMember(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    vaultId: row.vault_id,
    name: row.name,
    age: row.age,
    relationship: row.relationship,
    relationshipTag: row.relationship_tag,
    healthOverview: row.health_overview,
    notes: row.notes,
    lastVisitDate: row.last_visit_date,
    nextCheckupDate: row.next_checkup_date,
    authorizationStatus: row.authorization_status || 'approved',
    authorizationToken: row.authorization_token || null,
    authorizationRequestedAt: row.authorization_requested_at || null,
    authorizationApprovedAt: row.authorization_approved_at || null,
    requestedByEmail: row.requested_by_email || null,
    authorizedByEmail: row.authorized_by_email || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function applyUserScope(query, { userId }) {
  let scopedQuery = query;

  if (userId) {
    scopedQuery = scopedQuery.eq('user_id', userId);
  }

  return scopedQuery;
}

function buildMemberPayload(memberData = {}) {
  const now = new Date().toISOString();

  return {
    name: memberData.name?.trim() || null,
    age: memberData.age ?? null,
    relationship: memberData.relationship?.trim() || null,
    relationship_tag: memberData.relationshipTag?.trim() || memberData.relationship_tag || null,
    health_overview: memberData.healthOverview?.trim() || memberData.health_overview || null,
    notes: memberData.notes?.trim() || null,
    last_visit_date: memberData.lastVisitDate || memberData.last_visit_date || null,
    next_checkup_date: memberData.nextCheckupDate || memberData.next_checkup_date || null,
    authorization_status: memberData.authorizationStatus || memberData.authorization_status || (memberData.authorizationMethod === 'mail' ? 'pending' : 'approved'),
    authorization_token: memberData.authorizationToken || memberData.authorization_token || null,
    authorization_requested_at: memberData.authorizationRequestedAt || memberData.authorization_requested_at || null,
    authorization_approved_at: memberData.authorizationApprovedAt || memberData.authorization_approved_at || null,
    requested_by_email: memberData.requestedByEmail || memberData.requested_by_email || null,
    authorized_by_email: memberData.authorizedByEmail || memberData.authorized_by_email || null,
    user_id: memberData.userId || memberData.user_id || null,
    vault_id: memberData.vaultId || memberData.vault_id || null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

function buildMemberUpdatePayload(memberData = {}) {
  const payload = {
    name: memberData.name?.trim() || null,
    age: memberData.age ?? null,
    relationship: memberData.relationship?.trim() || null,
    relationship_tag: memberData.relationshipTag?.trim() || memberData.relationship_tag || null,
    health_overview: memberData.healthOverview?.trim() || memberData.health_overview || null,
    notes: memberData.notes?.trim() || null,
    last_visit_date: memberData.lastVisitDate || memberData.last_visit_date || null,
    next_checkup_date: memberData.nextCheckupDate || memberData.next_checkup_date || null,
    authorization_status: memberData.authorizationStatus || memberData.authorization_status,
    authorization_token: memberData.authorizationToken || memberData.authorization_token,
    authorization_requested_at: memberData.authorizationRequestedAt || memberData.authorization_requested_at,
    authorization_approved_at: memberData.authorizationApprovedAt || memberData.authorization_approved_at,
    requested_by_email: memberData.requestedByEmail || memberData.requested_by_email,
    authorized_by_email: memberData.authorizedByEmail || memberData.authorized_by_email,
    updated_at: new Date().toISOString(),
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

function normalizeVault(row) {
  if (!row) return null;

  return {
    id: row.id,
    vaultId: row.vault_id,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function buildStableVaultId(userId) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return null;
  }

  const safeSeed = normalizedUserId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'user';
  return `vault_${safeSeed.toLowerCase()}_${Date.now().toString(36)}`;
}

export const getFamilyVaultForUser = async (userId) => {
  if (!supabase) return null;
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from(FAMILY_VAULT_TABLE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return normalizeVault(data || null);
  } catch (err) {
    console.warn('Supabase family vault lookup warning:', err.message);
    return null;
  }
};

export const createOrGetFamilyVaultForUser = async (userId) => {
  if (!supabase) return null;
  if (!userId) return null;

  try {
    const { data: existingVault, error: selectError } = await supabase
      .from(FAMILY_VAULT_TABLE)
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (selectError && selectError.code !== 'PGRST116') {
      throw selectError;
    }

    if (existingVault) {
      if (existingVault.vault_id) {
        return normalizeVault(existingVault);
      }

      const vaultId = buildStableVaultId(userId);
      const { data, error } = await supabase
        .from(FAMILY_VAULT_TABLE)
        .update({ vault_id: vaultId, updated_at: new Date().toISOString() })
        .eq('id', existingVault.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return normalizeVault(data);
    }

    const vaultId = buildStableVaultId(userId);
    const { data, error } = await supabase
      .from(FAMILY_VAULT_TABLE)
      .insert({
        vault_id: vaultId,
        user_id: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return normalizeVault(data);
  } catch (err) {
    console.warn('Supabase family vault ensure warning:', err.message);
    return null;
  }
};

export const listFamilyMembers = async ({ userId, includeDeleted = false } = {}) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!userId) throw new Error('userId is required');

  try {
    let query = supabase
      .from(FAMILY_MEMBERS_TABLE)
      .select('*');

    query = applyUserScope(query, { userId });

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('Could not find the table')) {
        return [];
      }
      throw error;
    }

    return (data || []).map(normalizeMember).filter((member) => !isPendingAuthorizationMember(member));
  } catch (err) {
    if (err?.code === 'PGRST205' || err?.message?.includes('Could not find the table')) {
      return [];
    }
    throw err;
  }
};

export const createFamilyMember = async ({ userId, ...memberData }) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!userId) throw new Error('userId is required');

  const vault = await getFamilyVaultForUser(userId);
  if (!vault?.vaultId) {
    throw new Error('Family vault not found. Create a family vault before adding members.');
  }

  const payload = buildMemberPayload({ ...memberData, userId, vaultId: vault.vaultId });

  try {
    const { data, error } = await supabase
      .from(FAMILY_MEMBERS_TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('Could not find the table')) {
        throw new Error('Family members table is not available yet. Please retry after the schema is initialized.');
      }
      throw error;
    }

    return normalizeMember(data);
  } catch (err) {
    if (err?.code === 'PGRST205' || err?.message?.includes('Could not find the table')) {
      throw new Error('Family members table is not available yet. Please retry after the schema is initialized.');
    }
    throw err;
  }
};

export const createPendingFamilyMemberAuthorizationRequest = async ({ userId, ...memberData }) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!userId) throw new Error('userId is required');

  const vault = await getFamilyVaultForUser(userId);
  if (!vault?.vaultId) {
    throw new Error('Family vault not found. Create a family vault before requesting authorization.');
  }

  const authorizationToken = crypto.randomBytes(16).toString('hex');
  const pendingNotes = [memberData.notes?.trim(), `[PendingAuthorization:${authorizationToken}]`]
    .filter(Boolean)
    .join('\n')
    .trim();

  const payload = buildMemberPayload({
    ...memberData,
    userId,
    vaultId: vault.vaultId,
    notes: pendingNotes,
    authorizationStatus: 'pending',
    authorizationToken,
    authorizationRequestedAt: new Date().toISOString(),
    requestedByEmail: memberData.requestedByEmail || memberData.requested_by_email || null,
  });

  try {
    const { data, error } = await supabase
      .from(FAMILY_MEMBERS_TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('Could not find the table')) {
        throw new Error('Family members table is not available yet. Please retry after the schema is initialized.');
      }
      throw error;
    }

    return {
      member: normalizeMember(data),
      authorizationToken,
    };
  } catch (err) {
    if (err?.code === 'PGRST205' || err?.message?.includes('Could not find the table')) {
      throw new Error('Family members table is not available yet. Please retry after the schema is initialized.');
    }
    throw err;
  }
};

export const confirmPendingFamilyMemberAuthorizationRequest = async (authorizationToken, authorizedByEmail = null) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!authorizationToken) throw new Error('authorizationToken is required');

  try {
    const { data, error } = await supabase
      .from(FAMILY_MEMBERS_TABLE)
      .select('*')
      .is('deleted_at', null);

    if (error) {
      throw error;
    }

    const row = (data || []).find((item) => (item.notes || '').includes(`[PendingAuthorization:${authorizationToken}]`));
    if (!row) {
      return null;
    }

    const cleanedNotes = (row.notes || '')
      .replace(new RegExp(`\\[PendingAuthorization:${escapeRegExp(authorizationToken)}\\]`, 'g'), '')
      .trim();

    const { data: updatedRow, error: updateError } = await supabase
      .from(FAMILY_MEMBERS_TABLE)
      .update({
        notes: cleanedNotes || null,
        authorization_status: 'approved',
        authorization_token: null,
        authorization_approved_at: new Date().toISOString(),
        authorized_by_email: authorizedByEmail || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return normalizeMember(updatedRow);
  } catch (err) {
    throw err;
  }
};

export const updateFamilyMember = async (memberId, { userId, ...memberData }) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!memberId) throw new Error('memberId is required');

  const updates = buildMemberUpdatePayload({ ...memberData, userId });

  let query = supabase
    .from(FAMILY_MEMBERS_TABLE)
    .update(updates)
    .eq('id', memberId);

  query = applyUserScope(query, { userId });

  const { data, error } = await query.select().single();

  if (error) {
    throw error;
  }

  return normalizeMember(data);
};

export const deleteFamilyMember = async (memberId, { userId } = {}) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!memberId) throw new Error('memberId is required');

  let query = supabase
    .from(FAMILY_MEMBERS_TABLE)
    .delete()
    .eq('id', memberId);

  query = applyUserScope(query, { userId });

  const { data, error } = await query.select().single();

  if (error) {
    throw error;
  }

  return normalizeMember(data);
};

export const deleteFamilyVaultForUser = async (userId) => {
  if (!supabase) return null;
  if (!userId) return null;

  try {
    const vault = await getFamilyVaultForUser(userId);
    if (!vault?.vaultId) {
      return { deletedVault: false, deletedMembers: 0 };
    }

    const { error: membersError } = await supabase
      .from(FAMILY_MEMBERS_TABLE)
      .delete()
      .eq('user_id', userId);

    if (membersError) {
      throw membersError;
    }

    const { error: vaultError } = await supabase
      .from(FAMILY_VAULT_TABLE)
      .delete()
      .eq('user_id', userId);

    if (vaultError) {
      throw vaultError;
    }

    return { deletedVault: true, deletedMembers: 1 };
  } catch (err) {
    console.warn('Supabase family vault delete warning:', err.message);
    return null;
  }
};

export const getFamilyVaultSummary = async ({ userId } = {}) => {
  const members = await listFamilyMembers({ userId, includeDeleted: false });

  const relationshipTags = [...new Set(members.map((member) => member.relationshipTag).filter(Boolean))].sort();
  const upcomingCheckups = members.filter((member) => member.nextCheckupDate).length;
  const membersWithHealthNotes = members.filter((member) => member.healthOverview || member.notes).length;
  const recentVisits = members.filter((member) => member.lastVisitDate).length;

  return {
    totalMembers: members.length,
    relationshipTagCount: relationshipTags.length,
    upcomingCheckups,
    membersWithHealthNotes,
    recentVisits,
    relationshipTags,
    healthOverview: members.filter((member) => member.healthOverview || member.notes),
  };
};
