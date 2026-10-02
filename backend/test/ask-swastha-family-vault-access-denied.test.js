// Negative-case sibling of ask-swastha-family-vault-access.test.js — see
// that file's header comment for why this lives in its own file (a
// process.exit(0)-using after() hook racing the TAP reporter when two tests
// share one file).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import app from '../app.js';
import { createOrUpdateUser, deleteUserById } from '../db/users.js';
import { recordAcknowledgement } from '../db/aiNoticeAcknowledgements.js';
import { AI_NOTICE_VERSION } from '../rag/config/aiNotices.js';

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

test('a patient with NO family link to the target gets 403 from POST /rag/api/search/chat', async () => {
  const suffix = Date.now();
  const caller = await createOrUpdateUser({
    id: `usr_famnolink_${suffix}`,
    email: `fam-nolink-${suffix}@example.com`,
    name: 'No Family Link Test',
    role: 'patient',
    phone: '9876500004',
    dob: '1990-01-01',
    gender: 'Female',
    bloodGroup: 'B+',
    authProvider: 'email',
  });
  const stranger = await createOrUpdateUser({
    id: `usr_famstranger_${suffix}`,
    email: `fam-stranger-${suffix}@example.com`,
    name: 'Unrelated Patient Test',
    role: 'patient',
    phone: '9876500005',
    dob: '1990-01-01',
    gender: 'Male',
    bloodGroup: 'AB+',
    authProvider: 'email',
  });
  await recordAcknowledgement(caller.id, 'ask_swastha', AI_NOTICE_VERSION);

  try {
    const callerToken = jwt.sign({ userId: caller.id, email: caller.email, role: 'patient' }, JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${callerToken}` },
      body: JSON.stringify({
        query: 'What reports does this patient have?',
        session_id: `sess-famvault-nolink-test-${suffix}`,
        patient_user_id: stranger.id,
      }),
    });
    const data = await res.json();

    assert.equal(res.status, 403);
    assert.equal(data.error, 'You are not linked to this patient.');
  } finally {
    await deleteUserById(caller.id);
    await deleteUserById(stranger.id);
  }
});
