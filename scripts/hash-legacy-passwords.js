// One-time migration: hashes any plaintext password_hash values left over
// from before bcrypt hashing was added (see backend/db/users.js's
// createOrUpdateUser/updateUserPassword). Safe to re-run in any
// environment — a row whose password_hash already looks like a bcrypt hash
// is detected and skipped, never re-hashed.
//
// Usage:
//   node scripts/hash-legacy-passwords.js --dry-run   # report only, no writes
//   node scripts/hash-legacy-passwords.js             # actually update rows
//
// This only touches password_hash. NULL stays NULL (Google-only accounts
// never had a password to begin with).
import bcrypt from 'bcryptjs';
import supabase from '../backend/config/supabase.js';

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;
const PASSWORD_HASH_ROUNDS = 12; // matches backend/db/users.js
const TABLES = ['patients', 'doctors', 'pending_registrations'];

const dryRun = process.argv.includes('--dry-run');

async function migrateTable(table) {
  const { data, error } = await supabase
    .from(table)
    .select('id, email, password_hash')
    .not('password_hash', 'is', null);

  if (error) {
    console.error(`[${table}] query failed:`, error.message);
    return;
  }

  let alreadyHashed = 0;
  let toHash = 0;
  let updated = 0;
  let failed = 0;

  for (const row of data) {
    if (!row.password_hash) continue; // defensive — the query already excludes null

    if (BCRYPT_HASH_PATTERN.test(row.password_hash)) {
      alreadyHashed++;
      continue;
    }

    toHash++;
    console.log(`[${table}] ${dryRun ? 'would hash' : 'hashing'} plaintext password for ${row.email} (${row.id})`);
    if (dryRun) continue;

    try {
      const hashed = await bcrypt.hash(row.password_hash, PASSWORD_HASH_ROUNDS);
      const { error: updateError } = await supabase
        .from(table)
        .update({ password_hash: hashed })
        .eq('id', row.id);

      if (updateError) throw updateError;
      updated++;
    } catch (err) {
      failed++;
      console.error(`[${table}] failed to update ${row.id}:`, err.message);
    }
  }

  console.log(
    `[${table}] scanned=${data.length} alreadyHashed=${alreadyHashed} toHash=${toHash} updated=${updated} failed=${failed}`
  );
}

async function main() {
  console.log(dryRun ? 'DRY RUN — no writes will be made.\n' : 'LIVE RUN — plaintext passwords will be replaced with bcrypt hashes.\n');
  for (const table of TABLES) {
    await migrateTable(table);
  }
}

main();
