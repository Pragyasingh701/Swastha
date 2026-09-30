import express from 'express';
import { hasAcknowledged, recordAcknowledgement } from '../../db/aiNoticeAcknowledgements.js';
import { requireAuth } from '../middleware/auth.js';
import { AI_NOTICE_VERSION } from '../config/aiNotices.js';

const router = express.Router();

const VALID_FEATURES = ['ask_swastha', 'voice_intake'];

/**
 * GET /api/notices/ack/:feature
 * Lets the frontend check up front whether it needs to show the notice
 * modal, instead of only finding out via a 403 from the feature's own
 * endpoint on first use.
 */
router.get('/ack/:feature', requireAuth, async (req, res) => {
  const { feature } = req.params;
  const userId = req.user.userId;

  if (!VALID_FEATURES.includes(feature)) {
    return res.status(400).json({ error: `feature must be one of: ${VALID_FEATURES.join(', ')}` });
  }

  try {
    const acknowledged = await hasAcknowledged(userId, feature, AI_NOTICE_VERSION);
    return res.status(200).json({ acknowledged, notice_version: AI_NOTICE_VERSION });
  } catch (err) {
    console.error(`[GET /api/notices/ack] check failed for user ${userId}, feature ${feature}:`, err);
    return res.status(500).json({ error: 'Could not check notice acknowledgement. Please try again.' });
  }
});

/**
 * POST /api/notices/ack
 * Body: { feature: 'ask_swastha' | 'voice_intake' }
 * Records that the caller accepted the CURRENT AI_NOTICE_VERSION of
 * `feature`'s notice. Always stamps the server's current version — a client
 * cannot acknowledge an old or arbitrary version number.
 */
router.post('/ack', requireAuth, async (req, res) => {
  const { feature } = req.body || {};
  const userId = req.user.userId;

  if (!feature || !VALID_FEATURES.includes(feature)) {
    return res.status(400).json({ error: `feature must be one of: ${VALID_FEATURES.join(', ')}` });
  }

  try {
    await recordAcknowledgement(userId, feature, AI_NOTICE_VERSION);
    return res.status(200).json({ acknowledged: true, notice_version: AI_NOTICE_VERSION });
  } catch (err) {
    console.error(`[POST /api/notices/ack] failed to store acknowledgement for user ${userId}, feature ${feature}:`, err);
    return res.status(500).json({ error: 'Could not record acknowledgement. Please try again.' });
  }
});

export default router;
