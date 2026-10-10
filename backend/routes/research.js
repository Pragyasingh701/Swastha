import express from 'express';
import jwt from 'jsonwebtoken';
import { findUserById } from '../db/users.js';
import { validateQuery, runResearch } from '../services/researchService.js';
import { TinyFishError } from '../services/tinyfishService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

// Doctor Research Assistant: public medical questions answered with excerpts
// and links from an allowlist of official sources (see
// config/researchSources.js). Plain retrieval via TinyFish Search + Fetch —
// no patient data is read or sent, nothing is stored, and no AI model sees
// the page text. Lives in backend/routes/, not backend/rag/, for the same
// reason as clinic.js: it isn't generation-class work.

// Role is read from the DATABASE, not the JWT's `role` claim — a doctor who
// just finished registration still carries a role:'none' token. Same
// reasoning as clinic.js's requirePatientAuth.
async function requireDoctorAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Authentication required.' });

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session.' });
  }
  if (!decoded?.userId) return res.status(401).json({ message: 'Invalid session token.' });

  const user = await findUserById(decoded.userId);
  if (!user) return res.status(401).json({ message: 'Invalid session token.' });
  if (user.role !== 'doctor') {
    return res.status(403).json({ message: 'Only doctor accounts can use the research assistant.' });
  }
  req.user = { userId: user.id, email: user.email, role: user.role };
  next();
}

// In-memory sliding windows. TinyFish Search allows 30 requests/minute for
// the whole API key (shared by every doctor) and each query uses two calls,
// so a global ceiling sits under that, plus a per-doctor cap so one user can't use it all. Resets on
// restart, same trade-off as clinic.js's limiter.
const PER_DOCTOR_PER_MIN = 10;
const PER_DOCTOR_PER_DAY = 150;
const GLOBAL_PER_MIN = 12; // each query makes 2 Search calls (India + global)
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const doctorHits = new Map();
let globalHits = [];

function prune(list, windowMs, now) {
  while (list.length && now - list[0] >= windowMs) list.shift();
}

function takeSlot(userId) {
  const now = Date.now();
  prune(globalHits, MINUTE, now);
  const mine = doctorHits.get(userId) || [];
  prune(mine, DAY, now);

  const minuteCount = mine.filter((t) => now - t < MINUTE).length;
  if (minuteCount >= PER_DOCTOR_PER_MIN || mine.length >= PER_DOCTOR_PER_DAY || globalHits.length >= GLOBAL_PER_MIN) {
    doctorHits.set(userId, mine);
    return false;
  }
  mine.push(now);
  globalHits.push(now);
  doctorHits.set(userId, mine);
  if (doctorHits.size > 1000) {
    for (const [id, list] of doctorHits) {
      prune(list, DAY, now);
      if (list.length === 0) doctorHits.delete(id);
    }
  }
  return true;
}

/**
 * POST /api/research/search
 * Body: { query: string (3-200 chars) }. Results carry a `region`
 * ('india' | 'global') the page uses to filter client-side.
 */
router.post('/search', requireDoctorAuth, async (req, res) => {
  const checked = validateQuery(req.body?.query);
  if (!checked.ok) return res.status(400).json({ message: checked.message });

  if (!takeSlot(req.user.userId)) {
    return res.status(429).json({ message: 'Research is busy right now. Please wait a moment and try again.' });
  }

  try {
    const result = await runResearch({ query: checked.query });
    return res.json(result);
  } catch (err) {
    if (err instanceof TinyFishError) {
      console.error(`[POST /api/research/search] ${err.code}: ${err.message}`);
      if (err.code === 'not_configured') {
        return res.status(503).json({ message: 'The research assistant is not configured on this server.' });
      }
      if (err.code === 'quota' || err.code === 'rate_limited') {
        return res.status(503).json({ message: 'Research is busy or its daily allowance is used up. Please try again later.' });
      }
      return res.status(503).json({ message: 'The research service is unavailable right now. Please try again.' });
    }
    console.error('[POST /api/research/search] unexpected error:', err);
    return res.status(500).json({ message: 'Something went wrong running that search.' });
  }
});

export default router;
