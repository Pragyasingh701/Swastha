import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createNotification,
  getNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../db/notifications.js';
import { getDoctorLinkStatuses } from '../db/doctorPatients.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  const user = getAuthUser(req);

  if (!user?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const limit = Number(req.query.limit) || 25;
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

    const notifications = await getNotificationsForUser(user.userId, {
      limit,
      unreadOnly,
    });

    // Stamp live doctor_patient status onto any 'doctor_request'
    // notifications so the bell can tell a request is already
    // resolved even if it was resolved via the OTHER channel (the email
    // Accept/Decline link) rather than a click in this bell. See
    // getDoctorLinkStatuses in backend/db/doctorPatients.js for why this
    // can't be baked into the notification row itself.
    const requestLinkIds = notifications
      .filter((n) => n.eventType === 'doctor_request' && n.metadata?.linkId)
      .map((n) => n.metadata.linkId);

    if (requestLinkIds.length > 0) {
      const statusByLinkId = await getDoctorLinkStatuses(requestLinkIds);
      for (const notification of notifications) {
        const linkId = notification.metadata?.linkId;
        if (notification.eventType === 'doctor_request' && linkId && statusByLinkId[linkId]) {
          notification.metadata = { ...notification.metadata, linkStatus: statusByLinkId[linkId] };
        }
      }
    }

    const unreadCount = await getUnreadNotificationCount(user.userId);

    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    return res.status(500).json({ message: 'Unable to load notifications.', error: error.message });
  }
});

router.post('/', async (req, res) => {
  const user = getAuthUser(req);

  if (!user?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const {
      recipientId,
      actorId,
      actorRole = 'system',
      eventType,
      title,
      message,
      metadata = {},
    } = req.body || {};

    const targetRecipientId = recipientId || user.userId;
    const notification = await createNotification({
      recipientId: targetRecipientId,
      actorId: actorId || user.userId,
      actorRole,
      eventType,
      title,
      message,
      metadata,
    });

    return res.status(201).json({ notification });
  } catch (error) {
    console.error('Create notification error:', error);
    return res.status(400).json({ message: error?.message || 'Unable to create notification.' });
  }
});

router.patch('/:id/read', async (req, res) => {
  const user = getAuthUser(req);

  if (!user?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const notification = await markNotificationAsRead(req.params.id, user.userId);
    return res.json({ notification });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    return res.status(500).json({ message: 'Unable to update notification.' });
  }
});

router.patch('/read-all', async (req, res) => {
  const user = getAuthUser(req);

  if (!user?.userId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const notifications = await markAllNotificationsAsRead(user.userId);
    return res.json({ notifications });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ message: 'Unable to update notifications.' });
  }
});

export default router;