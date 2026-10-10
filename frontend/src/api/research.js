// Doctor Research Assistant — talks to backend/routes/research.js, mounted
// at /api/research on the main backend (same base as api/clinic.js).
import { apiRequest } from './client';

/**
 * @param {string} query - a public medical question (no patient identifiers)
 * @returns {Promise<{ retrievedAt: string, notice: null|'no_results'|'partial',
 *   results: Array<{ source, region, domain, title, url, date, excerpt, excerptFrom }> }>}
 */
export async function searchResearch(query) {
  return apiRequest('POST', '/research/search', { body: { query } });
}
