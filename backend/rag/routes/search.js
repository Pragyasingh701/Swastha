import express from 'express';
import { searchReports } from '../services/searchService.js';
import { requireAuth } from '../middleware/auth.js';
import { createUserRateLimiter } from '../middleware/rateLimit.js';
import { SEARCH_RATE_LIMIT_WINDOW_MS, SEARCH_RATE_LIMIT_MAX } from '../config/env.js';

const router = express.Router();

const searchRateLimiter = createUserRateLimiter({
  windowMs: SEARCH_RATE_LIMIT_WINDOW_MS,
  max: SEARCH_RATE_LIMIT_MAX,
});

/**
 * POST /api/search
 * Body: { query: string }
 * user_id comes from the JWT (req.user.userId), never from the request
 * body — a client can't ask to search someone else's records.
 */
router.post('/', requireAuth, searchRateLimiter, async (req, res) => {
  const { query } = req.body || {};
  const userId = req.user.userId;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query (non-empty string) is required' });
  }

  try {
    const result = await searchReports(query, userId);
    return res.status(200).json({
      answer: result.answer,
      structured: result.structured,
      sources: result.sources,
      noResultsFound: result.noResultsFound,
    });
  } catch (err) {
    // Healthcare data: fail loudly, log full detail server-side, but don't
    // leak internals (stack traces, raw DB errors) to the client.
    console.error(`[POST /api/search] failed for user ${userId}:`, err);
    return res.status(500).json({
      error: 'Search failed. Please try again; if this persists, contact support.',
    });
  }
});

export default router;
