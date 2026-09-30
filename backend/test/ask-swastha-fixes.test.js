// Access-expiry fix for Ask Swastha: a doctor whose 24h access window has
// lapsed must get 403 from POST /rag/api/search/chat, even though the DB
// row still literally reads status='accepted' (expiry is computed live,
// never written back — see backend/db/doctorPatients.js's isAccessExpired).
//
// Hits the real app + real Supabase project, same convention as
// wire-encryption.test.js (no test-DB separation exists in this codebase),
// creating one throwaway doctor + patient + doctor_patient link and
// cleaning all three up after the test.
//
// Kept in its own file, separate from ask-swastha-unit.test.js: this file
// statically imports app.js, which transitively loads the REAL
// backend/rag/config/aiClient.js and backend/rag/config/supabase.js — that
// would prevent mock.module() from ever taking effect for those two
// modules in a shared test process, since node:test's module mocking only
// intercepts a module's first load.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import app from '../app.js';
import { createOrUpdateUser, deleteUserById } from '../db/users.js';
import supabase from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
});

test('expired doctor access returns 403 from POST /rag/api/search/chat', async () => {
  const suffix = Date.now();
  const doctor = await createOrUpdateUser({
    id: `doc_expirytest_${suffix}`,
    email: `expiry-doctor-${suffix}@example.com`,
    name: 'Expiry Test Doctor',
    role: 'doctor',
    authProvider: 'email',
  });
  const patient = await createOrUpdateUser({
    id: `usr_expirytest_${suffix}`,
    email: `expiry-patient-${suffix}@example.com`,
    name: 'Expiry Test Patient',
    role: 'patient',
    phone: '9876500001',
    dob: '1990-01-01',
    gender: 'Female',
    bloodGroup: 'A+',
    authProvider: 'email',
  });

  // Same shape resolveDoctorLinkRequest writes on acceptance, except
  // access_expires_at is stamped in the past — this is exactly the state
  // isDoctorLinkedToPatient must treat as "not linked" (status is still
  // literally 'accepted' in the row; only the live expiry check catches it).
  const { error: linkError } = await supabase.from('doctor_patient').insert({
    doctor_id: doctor.id,
    patient_id: patient.id,
    patient_name: patient.name,
    status: 'accepted',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    responded_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    access_expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // expired 1h ago
  });
  assert.equal(linkError, null, `doctor_patient insert should succeed: ${linkError?.message}`);

  const token = jwt.sign({ userId: doctor.id, email: doctor.email, role: 'doctor' }, JWT_SECRET, {
    expiresIn: '1h',
  });

  try {
    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: 'What medicines is this patient on?',
        session_id: `sess-expiry-test-${suffix}`,
        patient_user_id: patient.id,
      }),
    });
    const data = await res.json();

    assert.equal(res.status, 403);
    // Same shape as the "no link at all" case — no distinguishing message
    // between expired and never-linked.
    assert.equal(data.error, 'You are not linked to this patient.');
  } finally {
    await supabase.from('doctor_patient').delete().eq('doctor_id', doctor.id).eq('patient_id', patient.id);
    await deleteUserById(doctor.id);
    await deleteUserById(patient.id);
  }
});
