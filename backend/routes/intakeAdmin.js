import express from 'express';
import { abandonStaleIntakeSessions } from '../db/intakeSessions.js';

const router = express.Router();

// Issue #10 fix (audit report): triggers the abandoned-session sweep
// (db/intakeSessions.js's abandonStaleIntakeSessions). No in-process
// scheduler exists in this codebase — the closest precedent is the
// in-memory OTP/token cleanup in routes/auth.js's setInterval, which only
// ever touches process memory, not a durable DB sweep that needs to run
// reliably even if the process restarts or (on typical free-tier hosting)
// sleeps between requests. Instead this follows the SAME externally-
// triggered pattern server.js's own health-check comment already names
// ("Health check / Keep-alive endpoints for Render & cron-job.org") — an
// external scheduler (cron-job.org, or any hosting platform's own cron
// feature) hits this endpoint on a schedule, same as the existing
// /health / /api/health endpoints are hit for keep-alive.
//
// Protected by a shared secret (not JWT — no doctor/patient session is
// involved, this is a machine-to-machine trigger) so an unauthenticated
// caller can't force a sweep or use this as a way to probe intake_sessions
// state. INTAKE_SWEEP_SECRET must be set for this route to do anything;
// if it's unset, every request 503s rather than silently running with no
// protection — a missing secret is a deploy misconfiguration, not a
// reason to fail open.
router.post('/sweep-abandoned', async (req, res) => {
  const configuredSecret = process.env.INTAKE_SWEEP_SECRET;
  if (!configuredSecret) {
    console.error('[intakeAdmin] INTAKE_SWEEP_SECRET is not set — refusing to run the sweep unprotected.');
    return res.status(503).json({ message: 'Sweep endpoint is not configured.' });
  }

  const providedSecret = req.headers['x-sweep-secret'];
  if (providedSecret !== configuredSecret) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    const result = await abandonStaleIntakeSessions();
    if (result.abandonedCount > 0) {
      console.log(`[intakeAdmin] abandoned ${result.abandonedCount} stale intake session(s): ${result.abandonedIds.join(', ')}`);
    }
    return res.status(200).json(result);
  } catch (error) {
    console.error('[intakeAdmin] sweep-abandoned failed:', error);
    return res.status(500).json({ message: 'Sweep failed.' });
  }
});

export default router;
