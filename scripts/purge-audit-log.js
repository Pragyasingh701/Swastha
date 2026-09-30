// Deletes ask_swastha_access_log rows older than AUDIT_LOG_RETENTION_DAYS
// (see backend/rag/config/env.js — default 365). Meant to be run on a
// schedule (e.g. a daily cron), not automatically by the app itself.
//
// Usage:
//   node scripts/purge-audit-log.js --dry-run   # report only, no deletes
//   node scripts/purge-audit-log.js             # actually delete rows
import dotenv from 'dotenv';
import supabase from '../backend/config/supabase.js';

dotenv.config({ path: new URL('../backend/.env', import.meta.url).pathname });

const AUDIT_LOG_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS) || 365;
const TABLE = 'ask_swastha_access_log';

const dryRun = process.argv.includes('--dry-run');

async function purge() {
  if (!supabase) {
    console.error('[purge-audit-log] Supabase client unavailable — check SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const cutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  console.log(`[purge-audit-log] retention: ${AUDIT_LOG_RETENTION_DAYS} days, cutoff: ${cutoff}${dryRun ? ' (dry run)' : ''}`);

  if (dryRun) {
    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoff);

    if (error) {
      console.error('[purge-audit-log] count query failed:', error.message);
      process.exit(1);
    }
    console.log(`[purge-audit-log] would delete ${count ?? 0} row(s). Re-run without --dry-run to apply.`);
    return;
  }

  const { error, count } = await supabase
    .from(TABLE)
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    console.error('[purge-audit-log] delete failed:', error.message);
    process.exit(1);
  }
  console.log(`[purge-audit-log] deleted ${count ?? 0} row(s) older than ${cutoff}.`);
}

purge();
