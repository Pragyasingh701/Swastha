import express from 'express';
import { startIntakeSession, advanceIntakeSession, finalizeIntakeSession } from '../services/intakeService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/intake/start
 * PATIENT-facing. Creates a new intake_sessions row for the caller and runs
 * the first dialogue-engine turn. patient_id comes from the JWT
 * (req.user.userId), never from the request body — a client can't start a
 * session on someone else's behalf.
 */
router.post('/start', requireAuth, async (req, res) => {
  const patientId = req.user.userId;

  try {
    const { session, turn } = await startIntakeSession(patientId);
    return res.status(200).json({
      session_id: session.id,
      next_question: turn.next_question,
      quick_reply_options: turn.quick_reply_options,
      section: turn.section,
      red_flag: turn.red_flag,
    });
  } catch (err) {
    console.error(`[POST /api/intake/start] failed for patient ${patientId}:`, err);
    return res.status(500).json({ error: 'Could not start intake session.' });
  }
});

/**
 * POST /api/intake/turn
 * Body: { session_id, message }
 * Ownership check happens here (not in the service) — same boundary as
 * intakeService.js not owning the auth/ownership decision, matching
 * routes/doctorPatients.js verifying link ownership at the route layer.
 */
router.post('/turn', requireAuth, async (req, res) => {
  const patientId = req.user.userId;
  const { session_id: sessionId, message } = req.body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message (non-empty string) is required' });
  }

  try {
    const { session, turn } = await advanceIntakeSession({ sessionId, patientMessage: message });

    // Ownership check after the fetch (advanceIntakeSession already loaded
    // the row) — a patient cannot advance someone else's session by
    // guessing a session_id.
    if (session.patient_id !== patientId) {
      return res.status(403).json({ error: 'This session does not belong to you.' });
    }

    return res.status(200).json({
      session_id: session.id,
      next_question: turn.next_question,
      quick_reply_options: turn.quick_reply_options,
      updated_fields: turn.structured_history,
      section: turn.section,
      section_complete: turn.section_complete,
      red_flag: turn.red_flag,
      red_flag_reason: turn.red_flag_reason,
      red_flag_is_new: turn.red_flag_is_new,
    });
  } catch (err) {
    console.error(`[POST /api/intake/turn] failed for patient ${patientId}, session ${sessionId}:`, err);
    return res.status(500).json({ error: 'Could not process intake turn.' });
  }
});

/**
 * POST /api/intake/finalize
 * Body: { session_id }
 */
router.post('/finalize', requireAuth, async (req, res) => {
  const patientId = req.user.userId;
  const { session_id: sessionId } = req.body || {};

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'session_id is required' });
  }

  try {
    const session = await finalizeIntakeSession(sessionId);

    if (session.patient_id !== patientId) {
      return res.status(403).json({ error: 'This session does not belong to you.' });
    }

    return res.status(200).json({
      session_id: session.id,
      status: session.status,
      structured_history: session.structured_history,
      completed_at: session.completed_at,
    });
  } catch (err) {
    console.error(`[POST /api/intake/finalize] failed for patient ${patientId}, session ${sessionId}:`, err);
    return res.status(500).json({ error: 'Could not finalize intake session.' });
  }
});

export default router;
