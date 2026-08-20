import supabase from '../config/supabase.js';

const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME || 'notifications';
const VALID_EVENT_TYPES = [
  'login',
  'family_update',
  'doctor_profile_view',
  'doctor_timeline_update',
  'family_member_added',
  'family_member_updated',
  'family_member_deleted',
];
const VALID_ACTOR_ROLES = ['patient', 'doctor', 'family_admin', 'system'];

function normalizeNotification(row) {
  if (!row) return null;

  return {
    id: row.id,
    recipientId: row.recipient_id ?? row.recipientId ?? null,
    actorId: row.actor_id ?? row.actorId ?? null,
    actorRole: row.actor_role ?? row.actorRole ?? 'system',
    eventType: row.event_type ?? row.eventType ?? 'system',
    title: row.title ?? '',
    message: row.message ?? '',
    metadata: row.metadata ?? {},
    readAt: row.read_at ?? row.readAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

function isValidEventType(value) {
  return VALID_EVENT_TYPES.includes(value);
}

function isValidActorRole(value) {
  return VALID_ACTOR_ROLES.includes(value);
}

export const getNotificationsForUser = async (userId, options = {}) => {
  if (!userId || !supabase) return [];

  try {
    const { limit = 25, unreadOnly = false } = options;

    let query = supabase
      .from(NOTIFICATIONS_TABLE)
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []).map(normalizeNotification);
  } catch (error) {
    console.warn('Notifications fetch warning:', error?.message || error);
    return [];
  }
};

export const getUnreadNotificationCount = async (userId) => {
  if (!userId || !supabase) return 0;

  try {
    const { count, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null);

    if (error) {
      throw error;
    }

    return count || 0;
  } catch (error) {
    console.warn('Notification count warning:', error?.message || error);
    return 0;
  }
};

export const createNotification = async ({
  recipientId,
  actorId = null,
  actorRole = 'system',
  eventType,
  title,
  message,
  metadata = {},
}) => {
  if (!supabase) {
    throw new Error('Database connection is unavailable.');
  }

  if (!recipientId) {
    throw new Error('Notification recipient is required.');
  }

  if (!eventType || !isValidEventType(eventType)) {
    throw new Error(`Invalid event type: ${eventType || 'missing'}`);
  }

  if (!actorRole || !isValidActorRole(actorRole)) {
    throw new Error(`Invalid actor role: ${actorRole || 'missing'}`);
  }

  if (!title || !message) {
    throw new Error('Notification title and message are required.');
  }

  const payload = {
    recipient_id: recipientId,
    actor_id: actorId,
    actor_role: actorRole,
    event_type: eventType,
    title: String(title).trim(),
    message: String(message).trim(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    read_at: null,
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return normalizeNotification(data);
  } catch (error) {
    console.error('Notification create error:', error);
    throw error;
  }
};

export const markNotificationAsRead = async (notificationId, userId) => {
  if (!supabase || !notificationId || !userId) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_id', userId)
      .select()
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data ? normalizeNotification(data) : null;
  } catch (error) {
    console.warn('Notification mark read warning:', error?.message || error);
    return null;
  }
};

export const markAllNotificationsAsRead = async (userId) => {
  if (!supabase || !userId) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .is('read_at', null)
      .select();

    if (error) {
      throw error;
    }

    return (data || []).map(normalizeNotification);
  } catch (error) {
    console.warn('Mark all notifications read warning:', error?.message || error);
    return [];
  }
};
