import crypto from 'crypto';
import supabase from '../config/supabase.js';
import { findUserById } from './users.js';
import { ageFromDob } from '../utils/age.js';
import { removeEmailTags } from '../utils/emailFormat.js';

const FAMILY_VAULT_TABLE = 'vault_table';
const FAMILY_MEMBERS_TABLE = 'family_members';
// vault_table.patient_id and family_members.patient_id point at `patients`.
const FAMILY_USER_ID_COLUMN = 'patient_id';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPendingAuthorizationMember(member) {
  return member?.authorizationStatus === 'pending' || Boolean(member?.notes && /\[PendingAuthorization:[^\]]+\]/.test(member.notes));
}

// Moved here from backend/routes/reports.js (was a private duplicate) so
// isPatientLinkedToFamilyMember below and any future caller share the exact
// same email-extraction logic rather than risking two copies drifting apart
// — a family member's email is stored either as a direct `email` field or
// tucked into a `[Email: ...]` tag inside `notes`, depending on how the
// member was created.
export function getMemberEmail(member = {}) {
  const directEmail = String(member.email || '').trim().toLowerCase();
  if (directEmail) return directEmail;

  const notes = String(member.notes || '');
  const emailMatch = notes.match(/\[Email:\s*([^\]]+)\]/i);
  return String(emailMatch?.[1] || '').trim().toLowerCase();
}

// The `[Email: ...]` tag inside notes is what links a member record to a real
// account, so it must only ever be written by the server (see
// isPatientLinkedToFamilyMember) — never taken from what a client typed.
export function stripEmailTags(notes) {
  return removeEmailTags(notes).replace(/\n{3,}/g, '\n\n').trim();
}

export function withEmailTag(notes, email) {
  const cleaned = stripEmailTags(notes);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return cleaned || null;
  return `[Email: ${normalizedEmail}]\n${cleaned}`.trim();
}

function sanitizeConditions(list) {
  if (!Array.isArray(list)) return [];

  return list
    .map((entry) => {
      const name = typeof entry?.name === 'string' ? entry.name.trim().slice(0, 100) : '';
      if (!name) return null;

      const ageOfOnset = Number(entry?.ageOfOnset);
      const notes = typeof entry?.notes === 'string' ? entry.notes.trim().slice(0, 200) : '';

      return {
        name,
        ageOfOnset: Number.isInteger(ageOfOnset) && ageOfOnset >= 0 && ageOfOnset <= 150 ? ageOfOnset : null,
        ...(notes ? { notes } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeMember(row) {
  if (!row) return null;
  const userIdFromRow = row[FAMILY_USER_ID_COLUMN] ?? row.user_id ?? row.userId ?? null;

  return {
    id: row.id,
    user_id: userIdFromRow,
    vaultId: row.vault_id,
    name: row.name,
    age: row.age,
    dob: row.dob || row.date_of_birth || null,
    relationship: row.relationship,
    relationshipTag: row.relationship_tag,
    parentMemberId: row.parent_member_id || row.parentMemberId || null,
    consentGivenAt: row.consent_given_at || row.consentGivenAt || null,
    healthOverview: row.health_overview,
    notes: row.notes,
    conditions: Array.isArray(row.conditions) ? row.conditions : [],
    lastVisitDate: row.last_visit_date,
    nextCheckupDate: row.next_checkup_date,
    authorizationStatus: row.authorization_status || 'approved',
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
    scopedQuery = scopedQuery.eq(FAMILY_USER_ID_COLUMN, userId);
  }

  return scopedQuery;
}

function buildMemberPayload(memberData = {}) {
  const now = new Date().toISOString();
  const normalizedDob = memberData.dob || memberData.date_of_birth || null;
  const computedAge = ageFromDob(normalizedDob);

  return {
    name: memberData.name?.trim() || null,
    dob: normalizedDob,
    age: computedAge ?? memberData.age ?? null,
    relationship: memberData.relationship?.trim() || null,
    relationship_tag: memberData.relationshipTag?.trim() || memberData.relationship_tag || null,
    parent_member_id: memberData.parentMemberId || memberData.parent_member_id || null,
    consent_given_at: memberData.consentGivenAt || memberData.consent_given_at || null,
    health_overview: memberData.healthOverview?.trim() || memberData.health_overview || null,
    notes: memberData.notes?.trim() || null,
    conditions: sanitizeConditions(memberData.conditions),
    last_visit_date: memberData.lastVisitDate || memberData.last_visit_date || null,
    next_checkup_date: memberData.nextCheckupDate || memberData.next_checkup_date || null,
    authorization_status: memberData.authorizationStatus || memberData.authorization_status || (memberData.authorizationMethod === 'mail' ? 'pending' : 'approved'),
    authorization_token: memberData.authorizationToken || memberData.authorization_token || null,
    authorization_requested_at: memberData.authorizationRequestedAt || memberData.authorization_requested_at || null,
    authorization_approved_at: memberData.authorizationApprovedAt || memberData.authorization_approved_at || null,
    requested_by_email: memberData.requestedByEmail || memberData.requested_by_email || null,
    authorized_by_email: memberData.authorizedByEmail || memberData.authorized_by_email || null,
    [FAMILY_USER_ID_COLUMN]: memberData.userId || memberData.user_id || null,
    vault_id: memberData.vaultId || memberData.vault_id || null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

function buildMemberUpdatePayload(memberData = {}) {
  const payload = {};
  const now = new Date().toISOString();

  const has = (key) => Object.prototype.hasOwnProperty.call(memberData, key);

  if (has('name')) payload.name = memberData.name?.trim() || null;
  if (has('dob') || has('date_of_birth')) {
    payload.dob = memberData.dob || memberData.date_of_birth || null;
    const computedAge = ageFromDob(payload.dob);
    if (computedAge !== null) {
      payload.age = computedAge;
    }
  }
  if (has('age') && !has('dob') && !has('date_of_birth')) payload.age = memberData.age ?? null;
  if (has('relationship')) payload.relationship = memberData.relationship?.trim() || null;
  if (has('relationshipTag') || has('relationship_tag')) payload.relationship_tag = memberData.relationshipTag?.trim() || memberData.relationship_tag || null;
  if (has('parentMemberId') || has('parent_member_id')) payload.parent_member_id = memberData.parentMemberId || memberData.parent_member_id || null;
  if (has('consentGivenAt') || has('consent_given_at')) payload.consent_given_at = memberData.consentGivenAt || memberData.consent_given_at || null;
  if (has('healthOverview') || has('health_overview')) payload.health_overview = memberData.healthOverview?.trim() || memberData.health_overview || null;
  if (has('notes')) payload.notes = memberData.notes?.trim() || null;
  if (has('conditions')) payload.conditions = sanitizeConditions(memberData.conditions);
  if (has('lastVisitDate') || has('last_visit_date')) payload.last_visit_date = memberData.lastVisitDate || memberData.last_visit_date || null;
  if (has('nextCheckupDate') || has('next_checkup_date')) payload.next_checkup_date = memberData.nextCheckupDate || memberData.next_checkup_date || null;

  // Authorization fields (status, token, timestamps, approver) are deliberately
  // NOT updatable here: they're only ever set by the invite/confirm flow.
  payload.updated_at = now;

  return payload;
}

function normalizeVault(row) {
  if (!row) return null;
  const userIdFromRow = row[FAMILY_USER_ID_COLUMN] ?? row.user_id ?? row.userId ?? null;

  return {
    id: row.id,
    vaultId: row.vault_id,
    userId: userIdFromRow,
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
      .eq(FAMILY_USER_ID_COLUMN, userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return normalizeVault(data || null);
  } catch (err) {
    // Not swallowed: "no vault" and "the database failed" must not look the same (a blip used to
    // show as "you have no vault" and POST /vault would then try to create one).
    console.error('Supabase family vault lookup failed:', err.message);
    throw err;
  }
};

export const createOrGetFamilyVaultForUser = async (userId) => {
  if (!supabase) return null;
  if (!userId) return null;

  try {
    const { data: existingVault, error: selectError } = await supabase
      .from(FAMILY_VAULT_TABLE)
      .select('*')
      .eq(FAMILY_USER_ID_COLUMN, userId)
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
        [FAMILY_USER_ID_COLUMN]: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      })
      .select()
      .single();

    if (error) {
      // Two requests creating the first vault at the same moment: the unique key
      // on vault_table.patient_id lets one win. Use the winner's row.
      if (error.code === '23505') {
        const { data: winner, error: winnerError } = await supabase
          .from(FAMILY_VAULT_TABLE)
          .select('*')
          .eq(FAMILY_USER_ID_COLUMN, userId)
          .maybeSingle();
        if (winnerError) throw winnerError;
        return normalizeVault(winner || null);
      }
      throw error;
    }

    return normalizeVault(data);
  } catch (err) {
    // Not swallowed: the caller must know the vault was NOT created, rather than be
    // handed null and report success.
    console.error('Supabase family vault ensure failed:', err.message);
    throw err;
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

// `linkedPatientId` is the id of the account the invite is mailed to. It is
// written only here, by the server: it is what later makes the access follow the
// account (see isPatientLinkedToFamilyMember), and it is never taken from a
// client-supplied field.
export const createPendingFamilyMemberAuthorizationRequest = async ({ userId, linkedPatientId = null, ...memberData }) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!userId) throw new Error('userId is required');

  const vault = await getFamilyVaultForUser(userId);
  if (!vault?.vaultId) {
    throw new Error('Family vault not found. Create a family vault before requesting authorization.');
  }

  const authorizationToken = crypto.randomBytes(16).toString('hex');
  const notes = memberData.notes?.trim() || null;

  const payload = buildMemberPayload({
    ...memberData,
    userId,
    vaultId: vault.vaultId,
    notes,
    authorizationStatus: 'pending',
    authorizationToken,
    authorizationRequestedAt: new Date().toISOString(),
    requestedByEmail: memberData.requestedByEmail || memberData.requested_by_email || null,
  });
  payload.linked_patient_id = linkedPatientId || null;

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
    const { data: row, error } = await supabase
      .from(FAMILY_MEMBERS_TABLE)
      .select('*')
      .eq('authorization_token', authorizationToken)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!row) {
      return null;
    }

    const requestedAt = row.authorization_requested_at ? new Date(row.authorization_requested_at) : null;
    const ttlHours = parseInt(process.env.AUTH_TOKEN_TTL_HOURS || '72', 10);
    if (requestedAt) {
      const ageMs = Date.now() - requestedAt.getTime();
      if (ageMs > ttlHours * 3600 * 1000) {
        // token expired
        return null;
      }
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

    const { data: deletedMembersData, error: membersError } = await supabase
      .from(FAMILY_MEMBERS_TABLE)
      .delete()
      .eq(FAMILY_USER_ID_COLUMN, userId)
      .select('id');

    if (membersError) {
      throw membersError;
    }

    const deletedMembersCount = Array.isArray(deletedMembersData) ? deletedMembersData.length : 0;

    const { error: vaultError } = await supabase
      .from(FAMILY_VAULT_TABLE)
      .delete()
      .eq(FAMILY_USER_ID_COLUMN, userId);

    if (vaultError) {
      throw vaultError;
    }

    return { deletedVault: true, deletedMembers: deletedMembersCount };
  } catch (err) {
    console.warn('Supabase family vault delete warning:', err.message);
    return null;
  }
};

// Checkups due from today up to 30 days ahead. A date in the past is overdue, not
// upcoming, and one further out is not due yet. Dates are stored as YYYY-MM-DD.
export const UPCOMING_CHECKUP_DAYS = 30;

export const countUpcomingCheckups = (members = [], now = new Date()) => {
  const today = now.toISOString().slice(0, 10);
  const limit = new Date(now.getTime() + UPCOMING_CHECKUP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return members.filter((member) => {
    const due = String(member.nextCheckupDate || '').slice(0, 10);
    return due >= today && due <= limit;
  }).length;
};

// The permission requests this admin has sent that are still waiting for the other person to
// approve. listFamilyMembers leaves them out on purpose (they are not members yet), so without
// this they were invisible. Only what the admin needs to recognise the request is returned:
// never the approval token.
export const listPendingFamilyInvites = async ({ userId } = {}) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!userId) throw new Error('userId is required');

  const { data, error } = await applyUserScope(
    supabase.from(FAMILY_MEMBERS_TABLE).select('*'),
    { userId }
  )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('Could not find the table')) {
      return [];
    }
    throw error;
  }

  return (data || [])
    .map(normalizeMember)
    .filter(isPendingAuthorizationMember)
    .map((member) => {
      const emailInNotes = String(member.notes || '').match(/\[Email:\s*([^\]]+)\]/i)?.[1]?.trim();
      return {
        id: member.id,
        name: member.name,
        email: emailInNotes || member.authorizedByEmail || null,
        relationship: member.relationship || null,
        requestedAt: member.authorizationRequestedAt || member.createdAt || null,
      };
    });
};

export const getFamilyVaultSummary = async ({ userId } = {}) => {
  const members = await listFamilyMembers({ userId, includeDeleted: false });

  const relationshipTags = [...new Set(members.map((member) => member.relationshipTag).filter(Boolean))].sort();
  const upcomingCheckups = countUpcomingCheckups(members);
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

/**
 * True if `patientId` (a family admin) may access `targetUserId`'s health
 * data via the family vault: `targetUserId` approved an invite sent from
 * `patientId`'s vault, and has not revoked it since. Mirrors
 * isDoctorLinkedToPatient's role as "the single shared source of truth every
 * route/service calls" (see backend/db/doctorPatients.js) so this logic lives
 * in exactly one place rather than being re-derived per route.
 *
 * The link is the member's account id (family_members.linked_patient_id), set
 * by the server when the invite is created. It is not an email address: the
 * access neither follows an email string to whoever owns it later, nor
 * survives the member revoking it (revokeFamilyAdminAccess clears the id) or
 * deleting their account (the foreign key sets it to null).
 *
 * SECURITY: only a member whose link went through the invite-by-email flow
 * counts: that flow stamps both authorization_requested_at (invite created,
 * token mailed to the target's own address) and authorization_approved_at
 * (the target clicked it). A member created or edited directly never has the
 * id or both stamps, so nobody can grant themselves access to an account by
 * typing its email into a member record. A pending invite never counts.
 *
 * Same-user is NOT handled here: a caller checking "is this my own id" should
 * do that check itself before calling this function.
 *
 * @param {string} patientId - the authenticated family admin's own id
 * @param {string} targetUserId - the account whose data access is being requested
 * @returns {Promise<boolean>}
 */
export const isPatientLinkedToFamilyMember = async (patientId, targetUserId) => {
  if (!patientId || !targetUserId || !supabase) return false;

  const { data, error } = await supabase
    .from(FAMILY_MEMBERS_TABLE)
    .select('id')
    .eq(FAMILY_USER_ID_COLUMN, patientId)
    .eq('linked_patient_id', targetUserId)
    .eq('authorization_status', 'approved')
    .not('authorization_requested_at', 'is', null)
    .not('authorization_approved_at', 'is', null)
    .is('deleted_at', null)
    .limit(1);

  if (error) throw error;
  return (data || []).length > 0;
};

// The family admins who currently have access to `patientId`'s records, so the
// patient can see who they are. Only what is needed to recognise them.
export const listFamilyAdminsWithAccessTo = async (patientId) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!patientId) throw new Error('patientId is required');

  const { data, error } = await supabase
    .from(FAMILY_MEMBERS_TABLE)
    .select('id, patient_id, relationship, authorization_approved_at')
    .eq('linked_patient_id', patientId)
    .eq('authorization_status', 'approved')
    .not('authorization_approved_at', 'is', null)
    .is('deleted_at', null)
    .order('authorization_approved_at', { ascending: false });

  if (error) throw error;

  return Promise.all((data || []).map(async (row) => {
    const admin = await findUserById(row.patient_id);
    return {
      id: row.id,
      adminName: admin?.name || null,
      adminEmail: admin?.email || null,
      relationship: row.relationship || null,
      approvedAt: row.authorization_approved_at,
    };
  }));
};

// Ends a family admin's access to `patientId`'s records. Scoped to the caller's
// own id, so nobody can revoke access to someone else's account. Returns false
// when there was nothing to revoke. The admin keeps their own record of the
// member, only the access is gone.
export const revokeFamilyAdminAccess = async (memberRowId, patientId) => {
  if (!supabase) throw new Error('Supabase client is not configured');
  if (!memberRowId || !patientId) throw new Error('memberRowId and patientId are required');

  const { data, error } = await supabase
    .from(FAMILY_MEMBERS_TABLE)
    .update({
      linked_patient_id: null,
      authorization_approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberRowId)
    .eq('linked_patient_id', patientId)
    .select('id');

  if (error) throw error;
  return (data || []).length > 0;
};
