import { randomUUID } from 'crypto';
import supabase from '../config/supabase.js';

const FAMILY_TABLE = process.env.FAMILY_TABLE_NAME || 'family_vault';
const FALLBACK_FAMILY_TABLE = FAMILY_TABLE === 'family_vault' ? 'family_members' : 'family_vault';

if (supabase && !process.env.FAMILY_TABLE_NAME) {
  console.warn(`ℹ️ [Family Vault] FAMILY_TABLE_NAME is not set, defaulting to "${FAMILY_TABLE}"`);
}

if (!global.__familyMembersStore) {
  global.__familyMembersStore = new Map();
}

const familyMembersStore = global.__familyMembersStore;

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeRecordShape(record = {}) {
  if (!record || typeof record !== 'object') return record;

  const normalized = { ...record };
  const idValue = normalized.id ?? normalized['id uuid'] ?? normalized.id;
  if (idValue !== undefined) {
    normalized.id = String(idValue);
  }
  delete normalized['id uuid'];
  return normalized;
}

// Pick `incoming` if it was explicitly provided (even if empty string / null), otherwise keep `fallback`.
function pickDefined(incoming, fallback) {
  return incoming !== undefined ? incoming : fallback;
}

function buildMemberRecord(ownerUserId, memberData = {}, existingRecord = {}) {
  const now = new Date().toISOString();
  const existingId = existingRecord?.id ?? memberData?.id;

  return {
    id: existingId ? String(existingId) : randomUUID(),
    owner_user_id: ownerUserId,
    name: normalizeText(pickDefined(memberData.name, existingRecord.name)),
    relationship: normalizeText(pickDefined(memberData.relationship, existingRecord.relationship)),
    relationship_tag: normalizeText(
      pickDefined(memberData.relationshipTag ?? memberData.relationship_tag, existingRecord.relationship_tag),
    ),
    health_overview: normalizeText(
      pickDefined(memberData.healthOverview ?? memberData.health_overview, existingRecord.health_overview),
    ),
    notes: normalizeText(pickDefined(memberData.notes, existingRecord.notes)),
    last_visit_date: normalizeDate(
      pickDefined(memberData.lastVisitDate ?? memberData.last_visit_date, existingRecord.last_visit_date),
    ),
    next_checkup_date: normalizeDate(
      pickDefined(memberData.nextCheckupDate ?? memberData.next_checkup_date, existingRecord.next_checkup_date),
    ),
    age: normalizeInteger(memberData.age !== undefined ? memberData.age : existingRecord.age),
    created_at: existingRecord.created_at || now,
    updated_at: now,
  };
}

function getOwnerRecords(ownerUserId) {
  return familyMembersStore.get(ownerUserId) || [];
}

function setOwnerRecords(ownerUserId, records) {
  familyMembersStore.set(ownerUserId, records);
}

function createLocalRecord(ownerUserId, record = {}) {
  const now = new Date().toISOString();
  const nextRecord = {
    ...record,
    id: record.id ? String(record.id) : randomUUID(),
    owner_user_id: ownerUserId,
    created_at: record.created_at || now,
    updated_at: record.updated_at || now,
  };

  const records = getOwnerRecords(ownerUserId);
  const nextRecords = [nextRecord, ...records.filter((item) => item.id !== nextRecord.id)];
  setOwnerRecords(ownerUserId, nextRecords);
  return nextRecord;
}

function updateLocalRecord(ownerUserId, memberId, updates = {}) {
  const records = getOwnerRecords(ownerUserId);
  const existingRecord = records.find((item) => String(item.id) === String(memberId)) || {};
  const nextRecord = {
    ...existingRecord,
    ...updates,
    id: String(memberId),
    owner_user_id: ownerUserId,
    created_at: existingRecord.created_at || updates.created_at || new Date().toISOString(),
    updated_at: updates.updated_at || new Date().toISOString(),
  };

  const nextRecords = records.map((item) => (item.id === memberId ? nextRecord : item));
  setOwnerRecords(ownerUserId, nextRecords);
  return nextRecord;
}

function deleteLocalRecord(ownerUserId, memberId) {
  const records = getOwnerRecords(ownerUserId);
  setOwnerRecords(ownerUserId, records.filter((item) => String(item.id) !== String(memberId)));
  return { deleted: true };
}

function sortMembers(records) {
  return [...records].sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime());
}

function isMissingTableError(error) {
  const message = (error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('relation')
  );
}

async function runTableQuery(tableName, action, payload) {
  try {
    if (action === 'read') {
      return await supabase
        .from(tableName)
        .select('*')
        .eq('owner_user_id', payload.ownerUserId)
        .order('updated_at', { ascending: false });
    }

    if (action === 'create') {
      return await supabase.from(tableName).insert(payload.record).select().single();
    }

    if (action === 'update') {
      return await supabase
        .from(tableName)
        .update(payload.updates)
        .eq('id', payload.memberId)
        .eq('owner_user_id', payload.ownerUserId)
        .select()
        .single();
    }

    if (action === 'delete') {
      return await supabase
        .from(tableName)
        .delete()
        .eq('id', payload.memberId)
        .eq('owner_user_id', payload.ownerUserId);
    }

    throw new Error(`Unsupported family table action: ${action}`);
  } catch (error) {
    return { data: null, error };
  }
}

async function readFromDatabase(ownerUserId) {
  if (!supabase) return null;

  try {
    const primaryResult = await runTableQuery(FAMILY_TABLE, 'read', { ownerUserId });
    const { data, error } = primaryResult;

    if (!error) {
      return (data || []).map((item) => normalizeRecordShape(item));
    }

    if (isMissingTableError(error)) {
      return sortMembers(getOwnerRecords(ownerUserId));
    }

    throw new Error(error.message || 'Failed to read family members from database');
  } catch (error) {
    console.warn('Supabase family read notice:', error.message);
    throw error;
  }
}

async function writeToDatabase(action, payload) {
  if (!supabase) return null;

  try {
    const primaryResult = await runTableQuery(FAMILY_TABLE, action, payload);

    if (action === 'delete') {
      const { error } = primaryResult;
      if (!error) {
        deleteLocalRecord(payload.ownerUserId, payload.memberId);
        return { deleted: true };
      }
      if (!isMissingTableError(error)) throw error;

      return deleteLocalRecord(payload.ownerUserId, payload.memberId);
    }

    const { data, error } = primaryResult;
    if (!error) return normalizeRecordShape(data);

    if (!isMissingTableError(error)) {
      throw error;
    }

    if (action === 'create') {
      return createLocalRecord(payload.ownerUserId, payload.record);
    }

    if (action === 'update') {
      return updateLocalRecord(payload.ownerUserId, payload.memberId, payload.updates);
    }

    throw error;
  } catch (error) {
    console.warn(`Supabase family ${action} notice:`, error.message);
    throw error;
  }
}

export async function listFamilyMembers(ownerUserId) {
  if (!ownerUserId) return [];

  if (supabase) {
    return await readFromDatabase(ownerUserId);
  }

  return sortMembers(getOwnerRecords(ownerUserId));
}

export async function createFamilyMember(ownerUserId, memberData) {
  if (!ownerUserId) throw new Error('ownerUserId is required');

  const record = buildMemberRecord(ownerUserId, memberData);

  if (supabase) {
    const recordForInsert = { ...record };
    delete recordForInsert.id;
    return await writeToDatabase('create', { ownerUserId, record: recordForInsert });
  }

  return createLocalRecord(ownerUserId, record);
}

export async function updateFamilyMember(ownerUserId, memberId, updates) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  if (!memberId) throw new Error('memberId is required');

  if (supabase) {
    // Build a flat update object with only the fields the caller actually sent,
    // mapped to the DB column names.  This avoids overwriting columns that weren't
    // part of the request and removes the dependency on the in-memory store.
    const dbUpdates = { updated_at: new Date().toISOString() };

    if (updates.name !== undefined) dbUpdates.name = normalizeText(updates.name);
    if (updates.relationship !== undefined) dbUpdates.relationship = normalizeText(updates.relationship);
    if (updates.relationshipTag !== undefined || updates.relationship_tag !== undefined)
      dbUpdates.relationship_tag = normalizeText(updates.relationshipTag ?? updates.relationship_tag);
    if (updates.healthOverview !== undefined || updates.health_overview !== undefined)
      dbUpdates.health_overview = normalizeText(updates.healthOverview ?? updates.health_overview);
    if (updates.notes !== undefined) dbUpdates.notes = normalizeText(updates.notes);
    if (updates.lastVisitDate !== undefined || updates.last_visit_date !== undefined)
      dbUpdates.last_visit_date = normalizeDate(updates.lastVisitDate ?? updates.last_visit_date);
    if (updates.nextCheckupDate !== undefined || updates.next_checkup_date !== undefined)
      dbUpdates.next_checkup_date = normalizeDate(updates.nextCheckupDate ?? updates.next_checkup_date);
    if (updates.age !== undefined) dbUpdates.age = normalizeInteger(updates.age);

    return await writeToDatabase('update', {
      memberId,
      ownerUserId,
      updates: dbUpdates,
    });
  }

  // Local / in-memory fallback — full merge is fine here because the store is always warm.
  const existingRecord = getOwnerRecords(ownerUserId).find((item) => item.id === memberId);
  const record = buildMemberRecord(ownerUserId, updates, existingRecord || { id: memberId, created_at: new Date().toISOString() });
  return updateLocalRecord(ownerUserId, memberId, record);
}

export async function removeFamilyMember(ownerUserId, memberId) {
  if (!ownerUserId) throw new Error('ownerUserId is required');
  if (!memberId) throw new Error('memberId is required');

  if (supabase) {
    return await writeToDatabase('delete', { ownerUserId, memberId });
  }

  return deleteLocalRecord(ownerUserId, memberId);
}

export async function getFamilyDashboard(ownerUserId) {
  const members = await listFamilyMembers(ownerUserId);

  const totalMembers = members.length;
  const relationshipMap = new Map();
  let upcomingCheckups = 0;
  let membersWithHealthNotes = 0;
  let recentVisits = 0;

  const today = new Date();
  const upcomingWindow = new Date();
  upcomingWindow.setDate(today.getDate() + 30);

  for (const member of members) {
    const tag = member.relationship_tag || member.relationship || 'Unspecified';
    relationshipMap.set(tag, (relationshipMap.get(tag) || 0) + 1);

    if (member.health_overview) {
      membersWithHealthNotes += 1;
    }

    if (member.last_visit_date) {
      recentVisits += 1;
    }

    if (member.next_checkup_date) {
      const checkupDate = new Date(member.next_checkup_date);
      if (!Number.isNaN(checkupDate.getTime()) && checkupDate >= today && checkupDate <= upcomingWindow) {
        upcomingCheckups += 1;
      }
    }
  }

  const relationshipTags = [...relationshipMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  return {
    members,
    summary: {
      totalMembers,
      relationshipTagCount: relationshipTags.length,
      upcomingCheckups,
      membersWithHealthNotes,
      recentVisits,
    },
    relationshipTags,
    healthOverview: [
      {
        label: 'Total Members',
        value: totalMembers,
        detail: 'People tracked in the vault',
      },
      {
        label: 'Relationship Tags',
        value: relationshipTags.length,
        detail: 'Grouped family categories',
      },
      {
        label: 'Upcoming Checkups',
        value: upcomingCheckups,
        detail: 'Next 30 days',
      },
      {
        label: 'Health Notes',
        value: membersWithHealthNotes,
        detail: 'Members with summary notes',
      },
    ],
  };
}