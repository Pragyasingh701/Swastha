// Doctor <-> patient links: who can see a patient's records, and for how long.
//
// A doctor sees nothing until the patient accepts; access then lasts 24 hours, ends
// at once if the patient revokes it, and never carries over to another doctor. These
// tests drive the real routes (doctor-patients and reports) against an in-memory
// database (see helpers/), checking access through the report routes the way a doctor's
// screen would.
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase } from './helpers/fakeSupabase.js';
import { startTestApp } from './helpers/testApp.js';

const db = createFakeSupabase();
const app = await startTestApp(db);
after(() => app.close());

const { signAuthToken } = await import('../config/jwt.js');
const HOUR = 60 * 60 * 1000;

const patient = {
  id: 'usr_pat1',
  email: 'asha@example.test',
  name: 'Asha Rao',
  patient_code: 'P-1001',
  phone: '9876501234',
  gender: 'F',
  dob: '1990-05-14',
  blood_group: 'B+',
};
const otherPatient = { id: 'usr_pat2', email: 'meera@example.test', name: 'Meera Das', patient_code: 'P-2002' };
const doctorA = { id: 'usr_docA', email: 'dr.a@example.test', name: 'Dr Anil Mehta' };
const doctorB = { id: 'usr_docB', email: 'dr.b@example.test', name: 'Dr Bina Shah' };

const as = (user, role) => signAuthToken({ userId: user.id, email: user.email, role });
const tokens = {
  patient: as(patient, 'patient'),
  otherPatient: as(otherPatient, 'patient'),
  doctorA: as(doctorA, 'doctor'),
  doctorB: as(doctorB, 'doctor'),
};

beforeEach(() => {
  db.clear();
  db.insert('patients', patient);
  db.insert('patients', otherPatient);
  db.insert('doctors', doctorA);
  db.insert('doctors', doctorB);
  db.insert('reports', {
    id: 'rep1',
    patient_id: patient.id,
    title: 'Blood test',
    category: 'Lab',
    report_date: '2026-09-01',
    notes: 'Haemoglobin 11.2',
    file_url: 'https://test-project.supabase.co/storage/v1/object/sign/reports/reports/usr_pat1/a.pdf?token=x',
  });
  app.mail.doctorRequests.length = 0;
});

// ── helpers ──────────────────────────────────────────────────────────────

const requestAccess = (doctorToken = tokens.doctorA, patientCode = patient.patient_code) =>
  app.api('POST', '/api/doctor-patients/link', { token: doctorToken, body: { patientCode } });
const linkRow = (doctor = doctorA, patientRecord = patient) =>
  db.rows('doctor_patient').find((l) => l.doctor_id === doctor.id && l.patient_id === patientRecord.id);
const patientAccepts = (linkId, token = tokens.patient) =>
  app.api('POST', `/api/doctor-patients/requests/${linkId}/accept`, { token });
const patientDeclines = (linkId, token = tokens.patient) =>
  app.api('POST', `/api/doctor-patients/requests/${linkId}/decline`, { token });
const readReports = (doctorToken = tokens.doctorA) =>
  app.api('GET', `/api/reports?userId=${patient.id}`, { token: doctorToken });
const readFile = (doctorToken = tokens.doctorA) =>
  app.api('GET', '/api/reports/rep1/file-url', { token: doctorToken });
const update = (id, patch) => db.client.from('doctor_patient').update(patch).eq('id', id).then(() => {});

async function grantAccess(doctor = doctorA, doctorToken = tokens.doctorA) {
  await requestAccess(doctorToken);
  const link = linkRow(doctor);
  const reply = await patientAccepts(link.id);
  assert.equal(reply.status, 200);
  return link.id;
}

// ── asking for access ────────────────────────────────────────────────────

test('only a doctor account can send a request', async () => {
  assert.equal((await app.api('POST', '/api/doctor-patients/link', { body: { patientCode: 'P-1001' } })).status, 401);
  assert.equal((await requestAccess(tokens.patient)).status, 403);
  // The role comes from the database, not from what the token claims.
  const lyingToken = as(patient, 'doctor');
  assert.equal((await requestAccess(lyingToken)).status, 403);
  assert.equal(db.rows('doctor_patient').length, 0);
});

test('an unknown or empty patient code creates nothing', async () => {
  assert.equal((await requestAccess(tokens.doctorA, 'P-9999')).status, 400);
  assert.equal((await requestAccess(tokens.doctorA, '   ')).status, 400);
  assert.equal(db.rows('doctor_patient').length, 0);
});

test('a request is pending, emails the patient, and reveals none of their details', async () => {
  const { status, body } = await requestAccess(tokens.doctorA, '#P-1001');
  assert.equal(status, 200);
  assert.equal(body.link.status, 'pending');
  assert.deepEqual(Object.keys(body.link).sort(), ['id', 'status']);

  const serialized = JSON.stringify(body);
  for (const secret of [patient.dob, patient.blood_group, patient.phone]) {
    assert.equal(serialized.includes(secret), false, `response leaked ${secret}`);
  }
  assert.equal(app.mail.doctorRequests.length, 1);
  assert.equal(app.mail.doctorRequests[0].to, patient.email);
  assert.equal(app.mail.doctorRequests[0].doctorName, doctorA.name);
});

test('repeating the same request does not send the patient another email', async () => {
  const first = await requestAccess();
  const second = await requestAccess();
  assert.equal(second.body.link.id, first.body.link.id);
  assert.equal(db.rows('doctor_patient').length, 1);
  assert.equal(app.mail.doctorRequests.length, 1);
});

test('a pending request gives the doctor no access to records, files or summary', async () => {
  await requestAccess();
  assert.equal((await readReports()).status, 403);
  assert.equal((await readFile()).status, 403);
  assert.equal((await app.api('GET', `/api/doctor-patients/${patient.id}/summary`, { token: tokens.doctorA })).status, 403);
});

// ── the patient answers ──────────────────────────────────────────────────

test('accepting opens the records for 24 hours', async () => {
  await requestAccess();
  const link = linkRow();
  const { status, body } = await patientAccepts(link.id);
  assert.equal(status, 200);
  assert.equal(body.link.status, 'accepted');

  const expiresIn = new Date(linkRow().access_expires_at).getTime() - Date.now();
  assert.ok(expiresIn > 23.9 * HOUR && expiresIn <= 24 * HOUR, `expires in ${expiresIn / HOUR}h`);
  assert.equal(linkRow().email_action_token, null, 'the emailed link is spent');

  const reports = await readReports();
  assert.equal(reports.status, 200);
  assert.deepEqual(reports.body.reports.map((r) => r.id), ['rep1']);
  assert.equal((await readFile()).status, 200);
});

test('only the patient the request is for can answer it', async () => {
  await requestAccess();
  const link = linkRow();
  assert.equal((await patientAccepts(link.id, tokens.otherPatient)).status, 403);
  assert.equal((await patientDeclines(link.id, tokens.otherPatient)).status, 403);
  assert.equal((await patientAccepts(link.id, tokens.doctorA)).status, 403, 'a doctor cannot accept for the patient');
  assert.equal((await app.api('POST', `/api/doctor-patients/requests/${link.id}/accept`)).status, 401);
  assert.equal(linkRow().status, 'pending');
  assert.equal((await readReports()).status, 403);
});

test('a request that was already answered cannot be answered again', async () => {
  await requestAccess();
  const link = linkRow();
  assert.equal((await patientAccepts(link.id)).status, 200);
  assert.equal((await patientAccepts(link.id)).status, 400);
  assert.equal((await patientDeclines(link.id)).status, 400);
  assert.equal(linkRow().status, 'accepted');
});

test('a request the patient never answered expires after 24 hours', async () => {
  await requestAccess();
  const link = linkRow();
  await update(link.id, { requested_at: new Date(Date.now() - 25 * HOUR).toISOString() });
  const { status, body } = await patientAccepts(link.id);
  assert.equal(status, 400);
  assert.match(body.message, /expired/i);
  assert.equal(linkRow().status, 'pending');
  assert.equal((await readReports()).status, 403);
});

test('access ends when the 24 hours are over', async () => {
  const linkId = await grantAccess();
  assert.equal((await readReports()).status, 200);
  await update(linkId, { access_expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await readReports()).status, 403);
  assert.equal((await readFile()).status, 403);
});

test('an accepted link with no expiry on record grants nothing', async () => {
  const linkId = await grantAccess();
  await update(linkId, { access_expires_at: null });
  assert.equal((await readReports()).status, 403);
});

test("one doctor's access does not extend to another doctor", async () => {
  await grantAccess(doctorA, tokens.doctorA);
  assert.equal((await readReports(tokens.doctorA)).status, 200);
  assert.equal((await readReports(tokens.doctorB)).status, 403);
  assert.equal((await readFile(tokens.doctorB)).status, 403);
});

test('a doctor never sees a patient they are not linked to, nor another patient\'s records', async () => {
  await grantAccess();
  const asking = await app.api('GET', `/api/reports?userId=${otherPatient.id}`, { token: tokens.doctorA });
  assert.equal(asking.status, 403);
  const unknown = await app.api('GET', '/api/reports?userId=usr_nobody', { token: tokens.doctorA });
  assert.equal(unknown.status, 403, 'an unknown id looks the same as a forbidden one');
});

test('a linked doctor can read but never change or delete the records', async () => {
  await grantAccess();
  const create = await app.api('POST', '/api/reports', {
    token: tokens.doctorA,
    body: { userId: patient.id, title: 'Planted', category: 'Lab', reportDate: '2026-10-01' },
  });
  const edit = await app.api('PUT', '/api/reports/rep1', {
    token: tokens.doctorA,
    body: { userId: patient.id, title: 'Changed', category: 'Lab', reportDate: '2026-09-01' },
  });
  const remove = await app.api('DELETE', `/api/reports/rep1?userId=${patient.id}`, { token: tokens.doctorA });
  for (const reply of [create, edit, remove]) assert.equal(reply.status, 403);
  const reports = db.rows('reports');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].title, 'Blood test');
});

test('a failed access check is a server error, not a quiet "no access"', async () => {
  await grantAccess();
  db.failNext('doctor_patient', 'select');
  assert.equal((await readReports()).status, 500);
});

// ── declining ────────────────────────────────────────────────────────────

test('a declined request gives no access, and the doctor may ask once more', async () => {
  await requestAccess();
  const link = linkRow();
  assert.equal((await patientDeclines(link.id)).status, 200);
  assert.equal(linkRow().status, 'declined');
  assert.equal((await readReports()).status, 403);

  const again = await requestAccess();
  assert.equal(again.status, 200);
  assert.equal(again.body.link.status, 'pending');
  assert.equal(app.mail.doctorRequests.length, 2, 'the patient is told about the second request');
});

test('after a second decline the doctor has to wait before asking again', async () => {
  await requestAccess();
  await patientDeclines(linkRow().id);
  await requestAccess();
  await patientDeclines(linkRow().id);

  const blocked = await requestAccess();
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.message, /declined your request again/i);
  const viaReRequest = await app.api('POST', `/api/doctor-patients/${patient.id}/re-request`, { token: tokens.doctorA });
  assert.equal(viaReRequest.status, 400);
  assert.equal(linkRow().status, 'declined');
  assert.equal(app.mail.doctorRequests.length, 2, 'no third email');

  await update(linkRow().id, { cooldown_until: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await requestAccess()).body.link.status, 'pending');
});

test('removing a declined card hides it but keeps the decline history', async () => {
  await requestAccess();
  await patientDeclines(linkRow().id);
  const removed = await app.api('DELETE', `/api/doctor-patients/${patient.id}`, { token: tokens.doctorA, body: {} });
  assert.equal(removed.status, 200);
  assert.ok(linkRow(), 'the row is still there');
  assert.equal(linkRow().hidden_by_doctor, true);
  assert.equal(linkRow().decline_count, 1);
});

test('a request the patient can still answer cannot be cancelled by the doctor', async () => {
  await requestAccess();
  const removed = await app.api('DELETE', `/api/doctor-patients/${patient.id}`, { token: tokens.doctorA, body: {} });
  assert.equal(removed.status, 400);
  assert.equal(linkRow().status, 'pending');
});

test("one doctor cannot remove another doctor's link", async () => {
  await grantAccess(doctorA, tokens.doctorA);
  const attempt = await app.api('DELETE', `/api/doctor-patients/${patient.id}`, { token: tokens.doctorB, body: {} });
  assert.equal(attempt.status, 200, 'nothing to remove for doctor B');
  assert.equal(linkRow(doctorA).status, 'accepted');
  assert.equal((await readReports(tokens.doctorA)).status, 200);
});

// ── revoking ─────────────────────────────────────────────────────────────

test('the patient can end access at once, and the doctor is locked out immediately', async () => {
  const linkId = await grantAccess();
  assert.equal((await readReports()).status, 200);

  const revoked = await app.api('POST', `/api/doctor-patients/access/${linkId}/revoke`, { token: tokens.patient });
  assert.equal(revoked.status, 200);
  assert.equal((await readReports()).status, 403);
  assert.equal((await readFile()).status, 403);
  assert.deepEqual((await app.api('GET', '/api/doctor-patients/my-doctors', { token: tokens.patient })).body.doctors, []);
});

test("nobody else can revoke a patient's doctor, and only a patient can revoke", async () => {
  const linkId = await grantAccess();
  assert.equal((await app.api('POST', `/api/doctor-patients/access/${linkId}/revoke`, { token: tokens.otherPatient })).status, 404);
  assert.equal((await app.api('POST', `/api/doctor-patients/access/${linkId}/revoke`, { token: tokens.doctorA })).status, 403);
  assert.equal((await app.api('POST', `/api/doctor-patients/access/${linkId}/revoke`)).status, 401);
  assert.equal((await readReports()).status, 200, 'access is untouched');
});

test('there is nothing to revoke on a request that was never accepted', async () => {
  await requestAccess();
  const linkId = linkRow().id;
  assert.equal((await app.api('POST', `/api/doctor-patients/access/${linkId}/revoke`, { token: tokens.patient })).status, 404);
});

test('my-doctors lists only doctors with live access, to the patient only', async () => {
  await grantAccess(doctorA, tokens.doctorA);
  const { status, body } = await app.api('GET', '/api/doctor-patients/my-doctors', { token: tokens.patient });
  assert.equal(status, 200);
  assert.equal(body.doctors.length, 1);
  assert.equal(body.doctors[0].doctorName, doctorA.name);
  assert.equal((await app.api('GET', '/api/doctor-patients/my-doctors', { token: tokens.otherPatient })).body.doctors.length, 0);
  assert.equal((await app.api('GET', '/api/doctor-patients/my-doctors', { token: tokens.doctorA })).status, 403);

  await update(linkRow().id, { access_expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await app.api('GET', '/api/doctor-patients/my-doctors', { token: tokens.patient })).body.doctors.length, 0);
});

// ── the emailed accept / decline links ───────────────────────────────────

const tokenInEmail = () => new URL(app.mail.doctorRequests.at(-1).acceptUrl).searchParams.get('token');

test('opening the emailed link only shows a confirmation page: it changes nothing', async () => {
  await requestAccess();
  const token = tokenInEmail();
  const page = await app.api('GET', `/api/doctor-patients/email-action/accept?token=${token}`);
  assert.equal(page.status, 200);
  assert.equal(linkRow().status, 'pending', 'a mail scanner opening the link must not accept it');
  assert.equal((await readReports()).status, 403);
});

test('confirming from the email accepts once, and the link then stops working', async () => {
  await requestAccess();
  const token = tokenInEmail();
  const first = await app.api('POST', '/api/doctor-patients/email-action/accept', { form: { token } });
  assert.equal(first.status, 200);
  assert.equal(linkRow().status, 'accepted');
  assert.equal((await readReports()).status, 200);

  const reuse = await app.api('POST', '/api/doctor-patients/email-action/decline', { form: { token } });
  assert.match(String(reuse.body), /Unable to decline/);
  assert.equal(linkRow().status, 'accepted', 'the old link cannot undo the accepted request');
});

test('the emailed decline link declines, and a made-up token does nothing', async () => {
  await requestAccess();
  const bogus = await app.api('POST', '/api/doctor-patients/email-action/accept', { form: { token: 'f'.repeat(40) } });
  assert.match(String(bogus.body), /Unable to accept/);
  assert.equal(linkRow().status, 'pending');

  const declined = await app.api('POST', '/api/doctor-patients/email-action/decline', { form: { token: tokenInEmail() } });
  assert.match(String(declined.body), /Request declined/);
  assert.equal(linkRow().status, 'declined');
  assert.equal((await readReports()).status, 403);
});

test('an emailed link for a request that expired no longer works', async () => {
  await requestAccess();
  const token = tokenInEmail();
  await update(linkRow().id, { requested_at: new Date(Date.now() - 25 * HOUR).toISOString() });
  const late = await app.api('POST', '/api/doctor-patients/email-action/accept', { form: { token } });
  assert.match(String(late.body), /expired/i);
  assert.equal(linkRow().status, 'pending');
});
