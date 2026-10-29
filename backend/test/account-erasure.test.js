// Deleting an account: the user is told "Account and all associated records deleted", so
// this checks that is true. Rows that cascade in Postgres are covered by a schema check
// (the fake database does not cascade); everything the app removes itself is checked
// by running the real DELETE /api/auth/user route against an in-memory database
// (see helpers/).
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { startTestApp } from './helpers/testApp.js';

const db = createFakeSupabase();
const app = await startTestApp(db);
after(() => app.close());

const { signAuthToken } = await import('../config/jwt.js');
const { eraseAccountResidue, DELETED_ACCOUNT_PLACEHOLDER } = await import('../db/accountErasure.js');

const BUCKET_URL = (path) => `https://test-project.supabase.co/storage/v1/object/sign/reports/${path}?token=x`;

const leaving = { id: 'usr_leaving', email: 'leaving@example.test', name: 'Leaving Patient', patient_code: 'P-1' };
const staying = { id: 'usr_staying', email: 'staying@example.test', name: 'Staying Patient', patient_code: 'P-2' };
const doctor = {
  id: 'usr_doc',
  email: 'dr@example.test',
  name: 'Dr Anil Mehta',
  reg_certificate_url: BUCKET_URL('certificates/usr_doc/cert.pdf'),
};
const pending = { id: 'usr_pending', email: 'pending@example.test', name: 'Pending Person' };

const tokenFor = (user, role) => signAuthToken({ userId: user.id, email: user.email, role });
const deleteAccount = (user, role, extra = {}) =>
  app.api('DELETE', `/api/auth/user${extra.query || ''}`, { token: tokenFor(user, role), body: extra.body });

function seedEverything() {
  db.clear();
  db.insert('patients', leaving);
  db.insert('patients', staying);
  db.insert('doctors', doctor);
  db.insert('pending_registrations', pending);

  for (const owner of [leaving, staying]) {
    db.insert('reports', {
      patient_id: owner.id,
      title: `Report of ${owner.name}`,
      report_date: '2026-09-01',
      file_url: BUCKET_URL(`reports/${owner.id}/scan.pdf`),
    });
    db.insert('vault_table', { patient_id: owner.id, vault_id: `vault_${owner.id}` });
    db.insert('family_members', { patient_id: owner.id, name: `Relative of ${owner.name}` });
    db.insert('ai_notice_acknowledgements', { user_id: owner.id, feature: 'ask_swastha', notice_version: 1 });
    db.insert('ask_swastha_feedback', { user_id: owner.id, rating: 'up' });
    db.insert('ai_request_log', { user_id: owner.id, provider: 'gemini' });
  }
  db.insert('ask_swastha_access_log', { caller_user_id: 'usr_doc', target_patient_id: leaving.id });
  db.insert('ask_swastha_access_log', { caller_user_id: leaving.id, target_patient_id: leaving.id });
  db.insert('ask_swastha_access_log', { caller_user_id: 'usr_doc', target_patient_id: staying.id });
}

beforeEach(seedEverything);

const belongingTo = (table, column, id) => db.rows(table).filter((row) => row[column] === id);

// ── the route ────────────────────────────────────────────────────────────

test('deleting an account requires being signed in', async () => {
  assert.equal((await app.api('DELETE', '/api/auth/user')).status, 401);
  assert.equal((await app.api('DELETE', '/api/auth/user', { token: 'garbage' })).status, 401);
  assert.equal(db.rows('patients').length, 2);
});

test('a patient account and everything the app stores about it is removed', async () => {
  const { status, body } = await deleteAccount(leaving, 'patient');
  assert.equal(status, 200);
  assert.match(body.message, /deleted/i);

  assert.equal(belongingTo('patients', 'id', leaving.id).length, 0);
  assert.equal(belongingTo('reports', 'patient_id', leaving.id).length, 0);
  assert.equal(belongingTo('vault_table', 'patient_id', leaving.id).length, 0);
  assert.equal(belongingTo('family_members', 'patient_id', leaving.id).length, 0);
  assert.equal(belongingTo('ai_notice_acknowledgements', 'user_id', leaving.id).length, 0);
  assert.equal(belongingTo('ask_swastha_feedback', 'user_id', leaving.id).length, 0);
  assert.ok(db.removedFiles.includes(`reports/${leaving.id}/scan.pdf`), 'the uploaded report file is removed from storage');
});

test('the audit and provider logs are kept but no longer point at the person', async () => {
  await deleteAccount(leaving, 'patient');

  const accessLog = db.rows('ask_swastha_access_log');
  assert.equal(accessLog.length, 3, 'the security audit trail is not shortened');
  assert.equal(accessLog.some((row) => row.caller_user_id === leaving.id || row.target_patient_id === leaving.id), false);
  assert.equal(accessLog.filter((row) => row.target_patient_id === DELETED_ACCOUNT_PLACEHOLDER).length, 2);
  assert.equal(accessLog.filter((row) => row.caller_user_id === DELETED_ACCOUNT_PLACEHOLDER).length, 1);

  const providerLog = db.rows('ai_request_log');
  assert.equal(providerLog.length, 2);
  assert.equal(providerLog.find((row) => row.user_id === leaving.id), undefined);
  assert.equal(providerLog.filter((row) => row.user_id === null).length, 1);
});

test("deleting one account leaves every other person's data alone", async () => {
  await deleteAccount(leaving, 'patient');
  assert.equal(belongingTo('patients', 'id', staying.id).length, 1);
  assert.equal(belongingTo('reports', 'patient_id', staying.id).length, 1);
  assert.equal(belongingTo('vault_table', 'patient_id', staying.id).length, 1);
  assert.equal(belongingTo('family_members', 'patient_id', staying.id).length, 1);
  assert.equal(belongingTo('ai_notice_acknowledgements', 'user_id', staying.id).length, 1);
  assert.equal(belongingTo('ask_swastha_feedback', 'user_id', staying.id).length, 1);
  assert.equal(belongingTo('ai_request_log', 'user_id', staying.id).length, 1);
  assert.equal(belongingTo('ask_swastha_access_log', 'target_patient_id', staying.id).length, 1);
  assert.equal(belongingTo('doctors', 'id', doctor.id).length, 1);
  assert.equal(db.removedFiles.some((path) => path.includes(staying.id)), false);
});

test('you can only delete the account your token belongs to, whatever the request says', async () => {
  const { status } = await deleteAccount(leaving, 'patient', { query: `?userId=${staying.id}`, body: { userId: staying.id, id: staying.id, email: staying.email } });
  assert.equal(status, 200);
  assert.equal(belongingTo('patients', 'id', leaving.id).length, 0);
  assert.equal(belongingTo('patients', 'id', staying.id).length, 1);
  assert.equal(belongingTo('reports', 'patient_id', staying.id).length, 1);
});

test('after deletion the old session no longer finds an account, and the email cannot sign in', async () => {
  const token = tokenFor(leaving, 'patient');
  await app.api('DELETE', '/api/auth/user', { token });
  assert.equal((await app.api('GET', '/api/auth/me', { token })).status, 404);
  const login = await app.api('POST', '/api/auth/login', { body: { email: leaving.email, password: 'Whatever!Passw0rd1' } });
  assert.equal(login.status, 401);
});

test('deleting twice is harmless', async () => {
  assert.equal((await deleteAccount(leaving, 'patient')).status, 200);
  assert.equal((await deleteAccount(leaving, 'patient')).status, 200);
  assert.equal(belongingTo('patients', 'id', staying.id).length, 1);
});

test("a doctor's certificate file is removed from storage, and only a file from our own bucket", async () => {
  assert.equal((await deleteAccount(doctor, 'doctor')).status, 200);
  assert.equal(belongingTo('doctors', 'id', doctor.id).length, 0);
  assert.deepEqual(db.removedFiles, [`certificates/${doctor.id}/cert.pdf`]);

  db.clear();
  db.insert('doctors', { ...doctor, reg_certificate_url: 'https://elsewhere.example/certificate.pdf' });
  assert.equal((await deleteAccount(doctor, 'doctor')).status, 200);
  assert.deepEqual(db.removedFiles, [], 'a URL that is not in our bucket is never sent to storage');
});

test('an account that never chose a role can be deleted too', async () => {
  assert.equal((await deleteAccount(pending, 'none')).status, 200);
  assert.equal(db.rows('pending_registrations').length, 0);
});

test('if the account itself cannot be deleted the user is told, and can try again', async () => {
  db.failNext('patients', 'delete');
  const first = await deleteAccount(leaving, 'patient');
  assert.equal(first.status, 500);
  assert.equal(belongingTo('patients', 'id', leaving.id).length, 1, 'the account is still there');
  assert.equal(belongingTo('ai_notice_acknowledgements', 'user_id', leaving.id).length, 1, 'the leftovers step did not run for an account that still exists');

  const retry = await deleteAccount(leaving, 'patient');
  assert.equal(retry.status, 200);
  assert.equal(belongingTo('patients', 'id', leaving.id).length, 0);
  assert.equal(belongingTo('ai_notice_acknowledgements', 'user_id', leaving.id).length, 0);
});

test('a failure while clearing leftovers does not undo the deletion or stop the other steps', async () => {
  db.failNext('ai_notice_acknowledgements', 'delete');
  const { status } = await deleteAccount(leaving, 'patient');
  assert.equal(status, 200);
  assert.equal(belongingTo('patients', 'id', leaving.id).length, 0);
  assert.equal(belongingTo('ask_swastha_feedback', 'user_id', leaving.id).length, 0, 'later steps still ran');
  assert.equal(db.rows('ask_swastha_access_log').some((row) => row.caller_user_id === leaving.id), false);
});

// ── the residue step on its own ──────────────────────────────────────────

test('eraseAccountResidue reports a failed step but still runs the rest', async () => {
  db.failNext('ask_swastha_feedback', 'delete', { code: 'XX000', message: 'boom' });
  const result = await eraseAccountResidue(leaving.id);
  assert.equal(result.ok, false);
  assert.equal(belongingTo('ai_notice_acknowledgements', 'user_id', leaving.id).length, 0);
  assert.equal(belongingTo('ai_request_log', 'user_id', leaving.id).length, 0);
});

test('a table that does not exist yet (migration not applied) is skipped, not an error', async () => {
  db.failNext('ask_swastha_feedback', 'delete', { code: '42P01', message: 'relation does not exist' });
  assert.equal((await eraseAccountResidue(leaving.id)).ok, true);
});

test('eraseAccountResidue with no user id touches nothing', async () => {
  assert.deepEqual(await eraseAccountResidue(''), { ok: false });
  assert.deepEqual(await eraseAccountResidue(undefined), { ok: false });
  assert.equal(db.rows('ai_notice_acknowledgements').length, 2);
});

// ── schema guard ─────────────────────────────────────────────────────────
// Postgres cascades take care of tables that reference patients/doctors. A table that
// holds a user's id as plain text is invisible to that, and so to "delete my account",
// unless accountErasure.js handles it. This fails when someone adds such a table
// without deciding what happens to it on account deletion.

const BASELINE = fs.readFileSync(new URL('../../supabase/schema/00000000000000_baseline_schema.sql', import.meta.url), 'utf8');
const ERASURE_SOURCE = fs.readFileSync(new URL('../db/accountErasure.js', import.meta.url), 'utf8');
const USER_COLUMN = /^(user_id|patient_id|doctor_id|caller_user_id|target_patient_id|linked_patient_id)$/;

function userColumnsByTable() {
  const found = [];
  for (const [, table, body] of BASELINE.matchAll(/CREATE TABLE IF NOT EXISTS "public"\."(\w+)" \(([\s\S]*?)\n\);/g)) {
    for (const [, column] of body.matchAll(/^\s+"(\w+)" /gm)) {
      if (USER_COLUMN.test(column)) found.push({ table, column });
    }
  }
  return found;
}

function foreignKeys() {
  const keys = new Map();
  for (const [, table, column, parent, action] of BASELINE.matchAll(
    /ALTER TABLE ONLY "public"\."(\w+)"\s+ADD CONSTRAINT "\w+" FOREIGN KEY \("(\w+)"\) REFERENCES "public"\."(\w+)"\("id"\) ON DELETE (CASCADE|SET NULL)/g,
  )) {
    if (parent === 'patients' || parent === 'doctors') keys.set(`${table}.${column}`, action);
  }
  return keys;
}

test('every table that holds a user id is either cascaded by the database or erased by accountErasure.js', () => {
  const keys = foreignKeys();
  const columns = userColumnsByTable();
  assert.ok(columns.length >= 8, 'the schema parser found the tables');
  assert.ok(keys.size >= 8, 'the schema parser found the foreign keys');

  const unhandled = columns
    .filter(({ table, column }) => !keys.has(`${table}.${column}`))
    .filter(({ table }) => !ERASURE_SOURCE.includes(`'${table}'`));
  assert.deepEqual(unhandled, [], 'these tables keep a user id with no foreign key and no step in accountErasure.js');
});

test('the tables accountErasure.js relies on really exist in the schema', () => {
  for (const [, table] of ERASURE_SOURCE.matchAll(/from\('(\w+)'\)/g)) {
    assert.ok(BASELINE.includes(`CREATE TABLE IF NOT EXISTS "public"."${table}"`), `${table} is not in the schema`);
  }
});

test('deleting a patient row cascades to everything that belongs to them', () => {
  const keys = foreignKeys();
  for (const key of [
    'reports.patient_id',
    'vault_table.patient_id',
    'family_members.patient_id',
    'doctor_patient.patient_id',
    'intake_sessions.patient_id',
    'intake_session_actions.patient_id',
    'report_embeddings.patient_id',
  ]) {
    assert.equal(keys.get(key), 'CASCADE', key);
  }
  assert.equal(keys.get('family_members.linked_patient_id'), 'SET NULL', "a relative's own account must not be deleted with the admin's");
  assert.equal(keys.get('clinic_checkin_codes.doctor_id'), 'CASCADE');
  assert.equal(keys.get('doctor_patient.doctor_id'), 'CASCADE');
});
