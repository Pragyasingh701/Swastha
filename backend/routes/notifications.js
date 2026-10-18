import express from 'express';
import {
  getNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationAsRead,
} from '../db/notifications.js';
import { getDoctorLinkStatuses } from '../db/doctorPatients.js';
import { getAuthUser } from '../config/jwt.js';

const router = express.Router();

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
    return res.status(500).json({ message: 'Unable to load notifications.' });
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

export default router;