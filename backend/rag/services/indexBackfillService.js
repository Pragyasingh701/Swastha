// Indexes a user's own reports that have no search embeddings yet.
//
// Indexing a report sends its text to the embedding provider, so it now needs
// the user's AI notice acknowledgement (see routes/reports.js). Reports saved
// BEFORE the user accepted the notice therefore skipped indexing and would
// stay unsearchable; when the user accepts, this catches them up.
import { supabase } from '../config/supabase.js';
import { listTimelineReports } from '../../db/reports.js';
import { processReportEmbeddings } from './embeddingService.js';
import { selectAll } from '../../utils/pagedSelect.js';

const MAX_REPORTS_PER_RUN = 200;
const inFlight = new Set();

export async function backfillReportIndex(userId) {
  if (!userId || inFlight.has(userId)) return { indexed: 0 };
  inFlight.add(userId);
  try {
    const reports = await listTimelineReports(userId);
    if (reports.length === 0) return { indexed: 0 };

    // One row per chunk, several per report, so a user with a few hundred reports passes 1000 rows.
    // Read short, the list of indexed reports missed some, and they were embedded (paid for) again.
    const { data, error } = await selectAll(() => supabase
      .from('report_embeddings')
      .select('report_id')
      .eq('patient_id', userId)
      .order('report_id', { ascending: true })
      .order('chunk_index', { ascending: true }), { label: 'indexed reports' });
    if (error) throw error;
    const alreadyIndexed = new Set((data || []).map((row) => String(row.report_id)));

    let indexed = 0;
    for (const report of reports.filter((r) => !alreadyIndexed.has(String(r.id))).slice(0, MAX_REPORTS_PER_RUN)) {
      try {
        await processReportEmbeddings({
          id: report.id,
          user_id: userId,
          title: report.title,
          diagnosis: report.diagnosis,
          medicines: report.medicines,
          notes: report.notes,
          report_date: report.reportDate,
        });
        indexed += 1;
      } catch (err) {
        console.error(`[index-backfill] report ${report.id} failed:`, err.message || err);
      }
    }
    if (indexed > 0) console.log(`[index-backfill] indexed ${indexed} report(s) for user ${userId}`);
    return { indexed };
  } catch (err) {
    console.error('[index-backfill] failed:', err.message || err);
    return { indexed: 0 };
  } finally {
    inFlight.delete(userId);
  }
}
