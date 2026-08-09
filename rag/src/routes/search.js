import express from 'express';
import { searchReports } from '../services/searchService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/search
 * Body: { query: string }
 * user_id comes from the JWT (req.user.userId), never from the request
 * body — a client can't ask to search someone else's records.
 */
router.post('/', requireAuth, async (req, res) => {
  const { query } = req.body || {};
  const userId = req.user.userId;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query (non-empty string) is required' });
  }

  try {
    const result = await searchReports(query, userId);
    return res.status(200).json({
      answer: result.answer,
      sources: result.sources,
      noResultsFound: result.noResultsFound,
    });
  } catch (err) {
    // Healthcare data: fail loudly, log full detail server-side, but don't
    // leak internals (stack traces, raw DB errors) to the client.
    console.error(`[POST /api/search] failed for user ${userId}, query="${query}":`, err);
    return res.status(500).json({
      error: 'Search failed. Please try again; if this persists, contact support.',
    });
  }
});

export default router;
