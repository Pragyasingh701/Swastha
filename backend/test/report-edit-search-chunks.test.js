// Editing a report's text must not leave the old text searchable in Ask Swastha.
// Runs the real route against an in-memory database (see helpers/).
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { startTestApp } from './helpers/testApp.js';

// The summary step calls this address; nothing listens there, which the route treats as "no summary".
process.env.RAG_BASE_URL = 'http://127.0.0.1:1/rag/api';

const db = createFakeSupabase();
const app = await startTestApp(db);
after(() => app.close());

const owner = { id: 'usr_owner', email: 'owner@example.test', name: 'Owner' };
const token = () => jwt.sign({ userId: owner.id, email: owner.email, role: 'patient' }, process.env.JWT_SECRET);

const report = {
  id: '41', // a string because the fake database compares strictly; the route receives it as text
  patient_id: owner.id,
  title: 'Blood test',
  doctor: 'Dr A',
  hospital: 'City Hospital',
  category: 'Lab Report',
  report_date: '2026-01-10',
  diagnosis: 'Anaemia',
  medicines: 'Iron tablets',
  notes: 'Haemoglobin 9.1',
};

beforeEach(() => {
  db.clear();
  db.insert('patients', owner);
  db.insert('reports', report);
  for (let chunk = 0; chunk < 3; chunk += 1) {
    db.insert('report_embeddings', { report_id: '41', patient_id: owner.id, chunk_index: chunk, chunk_text: 'old text' });
  }
  db.insert('report_embeddings', { report_id: '99', patient_id: 'someone_else', chunk_index: 0, chunk_text: 'not mine' });
});

const edit = (changes) => app.api('PUT', '/api/reports/41', {
  token: token(),
  body: {
    title: report.title,
    doctor: report.doctor,
    hospital: report.hospital,
    category: report.category,
    reportDate: report.report_date,
    diagnosis: report.diagnosis,
    medicines: report.medicines,
    notes: report.notes,
    ...changes,
  },
});

const chunksOf = (id) => db.rows('report_embeddings').filter((row) => row.report_id === String(id)).length;

for (const [field, value] of [
  ['notes', 'Haemoglobin 12.4'],
  ['diagnosis', 'Resolved'],
  ['medicines', 'None'],
  ['title', 'Blood test, repeat'],
]) {
  test(`changing the ${field} removes the report's old search chunks, and only its own`, async () => {
    const { status } = await edit({ [field]: value });
    assert.equal(status, 200);
    assert.equal(chunksOf(41), 0);
    assert.equal(chunksOf(99), 1, 'another report\'s chunks are untouched');
  });
}

test('an edit that leaves the searchable text alone keeps the search chunks', async () => {
  const { status } = await edit({ hospital: 'Other Hospital', doctor: 'Dr B', category: 'Prescription' });
  assert.equal(status, 200);
  assert.equal(chunksOf(41), 3);
});

test('if the old chunks cannot be removed, the edit is refused and nothing is saved', async () => {
  db.failNext('report_embeddings', 'delete');
  const { status } = await edit({ notes: 'Haemoglobin 12.4' });
  assert.equal(status, 500);
  assert.equal(db.rows('reports')[0].notes, 'Haemoglobin 9.1');
  assert.equal(chunksOf(41), 3);
});
