// Lists that can grow past 1000 rows must be read in full. Supabase cuts any read at 1000 rows
// and says nothing, so a list that is read with no paging loses its tail without any error.
// The fake database cuts reads at 1000 rows too (see helpers/fakeSupabase.js).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './helpers/fakeSupabase.js';

const here = (relative) => new URL(relative, import.meta.url).href;
const db = createFakeSupabase();
mock.module(here('../config/supabase.js'), { defaultExport: db.client });
mock.module(here('../rag/config/supabase.js'), { namedExports: { supabase: db.client } });
const indexed = [];
mock.module(here('../rag/services/embeddingService.js'), {
  namedExports: { processReportEmbeddings: async (report) => { indexed.push(report.id); return { chunksWritten: 1 }; } },
});

const { selectAll, selectAllIn, PAGE_SIZE } = await import('../utils/pagedSelect.js');
const { getIntakeQueueForPatients, getIntakeActionHistoryForDoctor, getPatientNamesByIds } = await import('../db/intakeSessions.js');
const { listTimelineReports, listReportActivityForPatients } = await import('../db/reports.js');
const { backfillReportIndex } = await import('../rag/services/indexBackfillService.js');

const DOCTOR = 'doc_1';
const day = (n) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString();
const rows = (count, make) => Array.from({ length: count }, (_, i) => make(i));

function reset() {
  db.clear();
  indexed.length = 0;
}

test('the fake database cuts a plain read at 1000 rows, like the real one', async () => {
  reset();
  for (const r of rows(1500, (i) => ({ id: `r${i}`, n: i }))) db.insert('things', r);
  const { data } = await db.client.from('things').select('*');
  assert.equal(data.length, 1000);
});

test('selectAll reads every page, in order, and stops on a short page', async () => {
  reset();
  for (const r of rows(2500, (i) => ({ id: `r${String(i).padStart(5, '0')}` }))) db.insert('things', r);
  const { data, error } = await selectAll(() => db.client.from('things').select('*').order('id'));
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.equal(data[0].id, 'r00000');
  assert.equal(data.at(-1).id, 'r02499');
  assert.equal(new Set(data.map((r) => r.id)).size, 2500, 'no row twice');
});

test('selectAll of exactly one full page asks once more and finds the end', async () => {
  reset();
  for (const r of rows(PAGE_SIZE, (i) => ({ id: `r${String(i).padStart(5, '0')}` }))) db.insert('things', r);
  const { data } = await selectAll(() => db.client.from('things').select('*').order('id'));
  assert.equal(data.length, PAGE_SIZE);
});

test('selectAll passes a database error through instead of returning part of the list', async () => {
  reset();
  for (const r of rows(1500, (i) => ({ id: `r${String(i).padStart(5, '0')}` }))) db.insert('things', r);
  let call = 0;
  const { data, error } = await selectAll(() => {
    const query = db.client.from('things').select('*').order('id');
    if (++call === 2) db.failNext('things', 'select', { code: 'XX000', message: 'boom' });
    return query;
  });
  assert.equal(data, null);
  assert.equal(error.message, 'boom');
});

test('selectAllIn keeps each filter to 100 ids and joins the results', async () => {
  reset();
  for (const r of rows(250, (i) => ({ id: `r${String(i).padStart(3, '0')}` }))) db.insert('things', r);
  const sizes = [];
  const ids = rows(250, (i) => `r${String(i).padStart(3, '0')}`);
  const { data } = await selectAllIn(ids, (chunk) => {
    sizes.push(chunk.length);
    return db.client.from('things').select('*').in('id', chunk).order('id');
  });
  assert.deepEqual(sizes, [100, 100, 50]);
  assert.equal(data.length, 250);
});

// ── the doctor's intake queue ────────────────────────────────────────────

function seedQueue({ patients, sessionsEach }) {
  const patientIds = rows(patients, (i) => `pat_${i}`);
  let n = 0;
  for (const patient_id of patientIds) {
    for (let s = 0; s < sessionsEach; s += 1) {
      db.insert('intake_sessions', {
        id: `s${String(n).padStart(6, '0')}`,
        patient_id,
        doctor_id: null,
        status: 'completed',
        priority: 'routine',
        chief_complaint: 'cough',
        created_at: day(n),
      });
      n += 1;
    }
  }
  return { patientIds, total: n };
}

test('the queue still shows a new red flag after a doctor has more than 1000 sessions', async () => {
  reset();
  // 130 patients x 12 sessions = 1560 sessions, so a plain read (oldest first) stops before the end.
  const { patientIds, total } = seedQueue({ patients: 130, sessionsEach: 12 });
  db.insert('intake_sessions', {
    id: 'newest-flag', patient_id: patientIds[7], doctor_id: null, status: 'in_progress', priority: 'flagged',
    red_flag_reason: 'chest pain', created_at: day(total + 5),
  });

  const queue = await getIntakeQueueForPatients(patientIds, DOCTOR);
  assert.equal(queue.length, total + 1);
  assert.equal(queue[0].id, 'newest-flag', 'flagged sessions come first, even the newest');
  assert.deepEqual(queue.slice(1, 4).map((s) => s.id), ['s000000', 's000001', 's000002'], 'then oldest first');
});

test('the queue leaves out what this doctor handled, other doctors\' own sessions, and abandoned ones', async () => {
  reset();
  const { patientIds } = seedQueue({ patients: 3, sessionsEach: 2 });
  db.insert('intake_session_actions', { session_id: 's000000', doctor_id: DOCTOR, patient_id: 'pat_0', action: 'completed' });
  db.insert('intake_session_actions', { session_id: 's000001', doctor_id: 'doc_2', patient_id: 'pat_0', action: 'removed' });
  db.insert('intake_sessions', { id: 'theirs', patient_id: 'pat_1', doctor_id: 'doc_2', status: 'completed', priority: 'routine', created_at: day(50) });
  db.insert('intake_sessions', { id: 'mine', patient_id: 'pat_1', doctor_id: DOCTOR, status: 'completed', priority: 'routine', created_at: day(51) });
  db.insert('intake_sessions', { id: 'gone', patient_id: 'pat_1', doctor_id: null, status: 'abandoned', priority: 'routine', created_at: day(52) });

  const ids = (await getIntakeQueueForPatients(patientIds, DOCTOR)).map((s) => s.id);
  assert.ok(!ids.includes('s000000'), 'handled by this doctor');
  assert.ok(ids.includes('s000001'), 'handled by another doctor only');
  assert.ok(!ids.includes('theirs'));
  assert.ok(ids.includes('mine'));
  assert.ok(!ids.includes('gone'));
});

test('the history lists every action this doctor took, newest first, past 1000', async () => {
  reset();
  const total = 1200;
  for (let i = 0; i < total; i += 1) {
    db.insert('intake_sessions', { id: `s${i}`, patient_id: `pat_${i % 50}`, chief_complaint: 'cough', priority: 'routine', created_at: day(i) });
    db.insert('intake_session_actions', {
      session_id: `s${i}`, doctor_id: DOCTOR, patient_id: `pat_${i % 50}`, action: 'completed', acted_at: day(i),
    });
  }
  const history = await getIntakeActionHistoryForDoctor(DOCTOR);
  assert.equal(history.length, total);
  assert.equal(history[0].session_id, `s${total - 1}`);
  assert.equal(history.at(-1).session_id, 's0');
  assert.equal(history[0].chief_complaint, 'cough', 'session details are joined in for every row');
});

test('patient names are found for a long list of ids', async () => {
  reset();
  for (let i = 0; i < 250; i += 1) db.insert('patients', { id: `pat_${i}`, name: `Patient ${i}`, email: `p${i}@example.test` });
  const names = await getPatientNamesByIds(rows(250, (i) => `pat_${i}`));
  assert.equal(Object.keys(names).length, 250);
  assert.equal(names.pat_249, 'Patient 249');
});

// ── reports ──────────────────────────────────────────────────────────────

test('a patient with more than 1000 reports gets all of them, newest first', async () => {
  reset();
  for (let i = 0; i < 1100; i += 1) {
    db.insert('reports', { id: i + 1, patient_id: 'pat_1', title: `Report ${i}`, category: 'Lab', report_date: day(i).slice(0, 10), notes: '' });
  }
  const list = await listTimelineReports('pat_1');
  assert.equal(list.length, 1100);
  assert.equal(list[0].title, 'Report 1099');
  assert.equal(list.at(-1).title, 'Report 0');
});

test('the dashboard counts reports across all of a doctor\'s patients, past 1000 rows', async () => {
  reset();
  for (let i = 0; i < 1300; i += 1) {
    db.insert('reports', { id: i + 1, patient_id: `pat_${i % 120}`, category: i % 2 ? 'Prescription' : 'Lab', report_date: '2026-01-01' });
  }
  const activity = await listReportActivityForPatients(rows(120, (i) => `pat_${i}`));
  assert.equal(activity.length, 1300);
  assert.equal(activity.filter((r) => r.category === 'Prescription').length, 650);
});

test('indexing catches up only the reports with no search chunks, however many chunks exist', async () => {
  reset();
  // 400 reports with 3 chunks each = 1200 chunk rows, plus one report that was never indexed.
  for (let i = 1; i <= 401; i += 1) {
    db.insert('reports', { id: i, patient_id: 'pat_1', title: `R${i}`, category: 'Lab', report_date: '2026-01-01', notes: 'n' });
  }
  for (let i = 1; i <= 400; i += 1) {
    for (let c = 0; c < 3; c += 1) db.insert('report_embeddings', { report_id: i, patient_id: 'pat_1', chunk_index: c });
  }
  const result = await backfillReportIndex('pat_1');
  assert.deepEqual(indexed, [401]);
  assert.equal(result.indexed, 1);
});
