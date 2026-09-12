import { apiRequest, getStoredToken } from '../api/client';

const STORAGE_PREFIX = 'swastha_notifications';
const NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function removeExpiredNotifications(items) {
  const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;
  return items.filter((item) => {
    const createdAt = item.createdAt || item.created_at;
    const timestamp = createdAt ? new Date(createdAt).getTime() : NaN;
    return !Number.isFinite(timestamp) || timestamp >= cutoff;
  });
}

function getUserKey(userLike) {
  const candidate = userLike || {};
  const email = candidate.email || candidate.user_email;
  const id = candidate.id || candidate.userId || candidate.patient_code || candidate.patientCode;

  if (email) return `${STORAGE_PREFIX}_${String(email).trim().toLowerCase()}`;
  if (id) return `${STORAGE_PREFIX}_${String(id).trim()}`;
  return `${STORAGE_PREFIX}_anonymous`;
}

export function readNotifications(userLike) {
  try {
    const key = getUserKey(userLike);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    const active = Array.isArray(parsed) ? removeExpiredNotifications(parsed) : [];
    if (active.length !== parsed.length) {
      localStorage.setItem(key, JSON.stringify(active));
    }
    return active;
  } catch {
    return [];
  }
}

export function writeNotifications(userLike, items) {
  try {
    const key = getUserKey(userLike);
    localStorage.setItem(key, JSON.stringify(Array.isArray(items) ? items : []));
  } catch {
    // Ignore storage errors in private browser modes.
  }
}

export function pushNotification(userLike, notification) {
  if (!userLike) return null;

  const eventType = notification.type === 'family_update'
    ? 'family_member_updated'
    : notification.type;

  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    read: false,
    ...notification,
  };

  const token = getStoredToken();
  const recipientId = userLike.id || userLike.userId;

  if (!token || !recipientId) {
    return persistLocalNotification(userLike, entry);
  }

  apiRequest('POST', '/notifications', {
    token,
    body: {
      recipientId,
      eventType,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata || { source: 'frontend' },
    },
  })
    .then((result) => {
      const saved = result?.notification;
      if (saved) dispatchNotificationEvent(saved);
    })
    .catch(() => persistLocalNotification(userLike, entry));

  return entry;
}

function persistLocalNotification(userLike, entry) {
  const current = readNotifications(userLike);
  writeNotifications(userLike, [entry, ...current].slice(0, 20));
  dispatchNotificationEvent(entry);
  return entry;
}

function dispatchNotificationEvent(notification) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('patientNotification', { detail: { notification } }));
  }
}

function normalizeNotification(item) {
  return {
    ...item,
    type: item.type || item.eventType || item.event_type,
    createdAt: item.createdAt || item.created_at,
    read: Boolean(item.read || item.readAt || item.read_at),
  };
}

export async function fetchNotifications(token, { unreadOnly = false, limit = 25 } = {}) {
  if (!token) return { notifications: [], unreadCount: 0 };

  let result;
  try {
    result = await apiRequest('GET', '/notifications', {
      token,
      query: { limit: String(limit), unreadOnly: String(unreadOnly) },
    });
  } catch {
    throw new Error('Unable to load notifications.');
  }

  return {
    notifications: Array.isArray(result.notifications) ? result.notifications.map(normalizeNotification) : [],
    unreadCount: Number(result.unreadCount) || 0,
  };
}

export async function markNotificationRead(token, notificationId) {
  if (!token || !notificationId) return null;

  let result;
  try {
    result = await apiRequest('PATCH', `/notifications/${notificationId}/read`, { token });
  } catch {
    throw new Error('Unable to mark notification as read.');
  }
  return result.notification ? normalizeNotification(result.notification) : null;
}

export async function markAllNotificationsRead(token) {
  if (!token) return [];

  let result;
  try {
    result = await apiRequest('PATCH', '/notifications/read-all', { token });
  } catch {
    throw new Error('Unable to mark notifications as read.');
  }
  return Array.isArray(result.notifications) ? result.notifications.map(normalizeNotification) : [];
}

export function notifyPatientLogin(userLike) {
  if (!userLike || userLike.role === 'doctor') return null;

  return pushNotification(userLike, {
    type: 'login',
    title: 'Welcome back',
    message: 'You signed in successfully and your dashboard is ready.',
  });
}

export function notifyPatientFamilyUpdate(userLike) {
  if (!userLike) return null;

  return pushNotification(userLike, {
    type: 'family_update',
    title: 'Family record updated',
    message: 'A family admin made a change to a family member record.',
  });
}

export function notifyDoctorProfileView(patientLike) {
  if (!patientLike) return null;

  return pushNotification(patientLike, {
    type: 'doctor_profile_view',
    title: 'Doctor viewed your profile',
    message: 'A doctor accessed your profile using the patient code.',
  });
}

export function notifyDoctorTimelineUpdate(patientLike) {
  if (!patientLike) return null;

  return pushNotification(patientLike, {
    type: 'doctor_timeline_update',
    title: 'Medical timeline updated',
    message: 'A doctor updated a medical timeline entry associated with your profile.',
  });
}
