import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../utils/notifications';

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function PatientNotifications() {
  const { token, user } = useAuth();
  const menuRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [selectedNotification, setSelectedNotification] = useState(null);

  async function loadNotifications() {
    if (!token || user?.role === 'doctor') {
      setNotifications([]);
      return;
    }

    try {
      const result = await fetchNotifications(token);
      setNotifications(result.notifications);
    } catch {
      setNotifications([]);
    }
  }

  useEffect(() => {
    loadNotifications();

    const handleNotificationUpdate = () => loadNotifications();
    window.addEventListener('patientNotification', handleNotificationUpdate);

    return () => window.removeEventListener('patientNotification', handleNotificationUpdate);
  }, [token, user?.role]);

  // The 'patientNotification' event above only fires from code running in
  // THIS tab — it does nothing for a new request from a doctor elsewhere,
  // or an accept/decline done on another device/tab. Same root cause and
  // fix as NotificationBell.jsx / DoctorRequests.jsx / DoctorPatients.jsx:
  // no realtime/websocket exists in this app (see
  // frontend/src/hooks/usePolling.js), so this polls every 20s while
  // visible plus refetches immediately on window focus.
  usePolling(loadNotifications, { intervalMs: 20000 });

  useEffect(() => {
    function handleClickOutside(event) {
      if (!menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((item) => !item.read).length;

  async function handleMarkRead(notification) {
    setSelectedNotification(notification);
    if (notification.read || !notification.id) return;

    try {
      const updated = await markNotificationRead(token, notification.id);
      if (updated) {
        setNotifications((current) => current.map((item) => item.id === notification.id ? updated : item));
        setSelectedNotification(updated);
      }
    } catch {
      // Keep the item unread when the API cannot be reached.
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;

    try {
      await markAllNotificationsRead(token);
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    } catch {
      // Keep the current state when the API cannot be reached.
    }
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="relative rounded-lg p-2 hover:bg-slate-100"
        aria-label="Open notifications"
        aria-expanded={isOpen}
      >
        <Bell size={20} className="text-slate-600" />
        {unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-3 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400"
            >
              {unreadCount > 0 ? `${unreadCount} new` : 'All read'}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-500">No activity yet.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleMarkRead(notification)}
                  className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50 last:border-b-0"
                >
                  <span
                    title={notification.read ? 'Read' : 'Unread'}
                    aria-label={notification.read ? 'Read notification' : 'Unread notification'}
                    className={`mt-2 h-2.5 w-2.5 rounded-full ${notification.read ? 'bg-slate-300' : 'bg-red-500'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-800">{notification.title}</span>
                      {!notification.read && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">New</span>}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">{notification.message}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{formatNotificationDate(notification.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selectedNotification && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4" onClick={() => setSelectedNotification(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Notification details</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{selectedNotification.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedNotification(null)} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close notification details">
                &times;
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-700">{selectedNotification.message}</p>
            <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="flex justify-between gap-4"><span>Received</span><span className="text-right font-medium text-slate-800">{formatNotificationDate(selectedNotification.createdAt)}</span></div>
              <div className="flex justify-between gap-4"><span>Event</span><span className="text-right font-medium text-slate-800">{selectedNotification.eventType || selectedNotification.type || 'Activity'}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
