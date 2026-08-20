const STORAGE_PREFIX = 'swastha_notifications';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

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
    return Array.isArray(parsed) ? parsed : [];
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

  fetch(`${API_BASE_URL}/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      recipientId,
      eventType,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata || { source: 'frontend' },
    }),
  })
    .then((response) => response.ok ? response.json() : null)
    .then((result) => {
      const saved = result?.notification;
      if (saved) dispatchNotificationEvent(saved);
    })
    .catch(() => persistLocalNotification(userLike, entry));

  return entry;
}

function getStoredToken() {
  try {
    return localStorage.getItem('swastha_token') || sessionStorage.getItem('swastha_token') || null;
  } catch {
    return null;
  }
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

  const query = new URLSearchParams({
    limit: String(limit),
    unreadOnly: String(unreadOnly),
  });
  const response = await fetch(`${API_BASE_URL}/notifications?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error('Unable to load notifications.');
  }

  const result = await response.json();
  return {
    notifications: Array.isArray(result.notifications) ? result.notifications.map(normalizeNotification) : [],
    unreadCount: Number(result.unreadCount) || 0,
  };
}

export async function markNotificationRead(token, notificationId) {
  if (!token || !notificationId) return null;

  const response = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Unable to mark notification as read.');
  const result = await response.json();
  return result.notification ? normalizeNotification(result.notification) : null;
}

export async function markAllNotificationsRead(token) {
  if (!token) return [];

  const response = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Unable to mark notifications as read.');
  const result = await response.json();
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
