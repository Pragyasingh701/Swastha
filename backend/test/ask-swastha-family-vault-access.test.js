// Fix: POST /rag/api/search/chat's patient_user_id targeting only ever
// checked a doctor_patient link — a PATIENT-role caller (a family admin)
// had NO way to ask about a linked family member's records at all, even
// though the family vault genuinely links a family member to their own
// separate Swastha account by email (see backend/db/family.js's
// isPatientLinkedToFamilyMember). Mirrors ask-swastha-fixes.test.js's
// convention: hits the real app + real Supabase project, creates throwaway
// accounts/links, cleans them all up after.
//
// Kept to exactly ONE test (the negative/403 case lives in its own sibling
// file, ask-swastha-family-vault-access-denied.test.js): this file's after()
// hook calls process.exit(0) to end a lingering open handle (observed:
// without it the process hangs forever after tests finish — some Supabase
// keep-alive connection never closes on its own). With TWO tests in one
// file, process.exit(0) raced the TAP reporter's output for the second test
// and silently dropped it from the report (no ok/not ok line, no assertion
// error, just absent — reproduced and isolated by running the exact same
// test logic as a plain script, which completed correctly every time, and
// by removing process.exit(0) here, which made both tests report correctly
// but then hung forever instead of exiting) — same reasoning
// ask-swastha-fixes.test.js's own file-isolation comment already documents
// for a different reason (module-mocking), now also needed for this one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import app from '../app.js';
import { createOrUpdateUser, deleteUserById } from '../db/users.js';
import {
  createOrGetFamilyVaultForUser,
  createPendingFamilyMemberAuthorizationRequest,
  confirmPendingFamilyMemberAuthorizationRequest,
  deleteFamilyMember,
  deleteFamilyVaultForUser,
} from '../db/family.js';
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

test('a family admin can search a linked family member\'s records via POST /rag/api/search/chat', async () => {
  const suffix = Date.now();
  const admin = await createOrUpdateUser({
    id: `usr_famadmin_${suffix}`,
    email: `fam-admin-${suffix}@example.com`,
    name: 'Family Admin Test',
    role: 'patient',
    phone: '9876500002',
    dob: '1985-01-01',
    gender: 'Female',
    bloodGroup: 'O+',
    authProvider: 'email',
  });
  const member = await createOrUpdateUser({
    id: `usr_fammember_${suffix}`,
    email: `fam-member-${suffix}@example.com`,
    name: 'Family Member Test',
    role: 'patient',
    phone: '9876500003',
    dob: '2015-01-01',
    gender: 'Male',
    bloodGroup: 'A+',
    authProvider: 'email',
  });
  // requireNoticeAck (rag/middleware/requireNoticeAck.js) gates EVERY
  // request to this route ahead of the family-link check under test — a
  // fresh test account has never acknowledged the ask_swastha AI-usage
  // notice, so it must be recorded directly here or the request 403s before
  // ever reaching the code being tested.
  await recordAcknowledgement(admin.id, 'ask_swastha', AI_NOTICE_VERSION);

  let familyMemberRowId = null;
  try {
    await createOrGetFamilyVaultForUser(admin.id);
    // The link to the member's own account is family_members.linked_patient_id,
    // set by the server when the invite is created. Access is only honored for
    // a link that went through the real invite flow: a pending request whose
    // token the member then confirms, which stamps both
    // authorization_requested_at and authorization_approved_at. A record
    // created directly is NOT enough (see family-vault-self-approval.test.js).
    const { member: createdMember, authorizationToken } = await createPendingFamilyMemberAuthorizationRequest({
      userId: admin.id,
      linkedPatientId: member.id,
      name: member.name,
      notes: `[Email: ${member.email}]`,
      relationship: 'Child',
    });
    await confirmPendingFamilyMemberAuthorizationRequest(authorizationToken);
    familyMemberRowId = createdMember.id;

    const adminToken = jwt.sign({ userId: admin.id, email: admin.email, role: 'patient' }, JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await fetch(`${baseUrl}/rag/api/search/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        query: 'What reports does this patient have?',
        session_id: `sess-famvault-test-${suffix}`,
        patient_user_id: member.id,
      }),
    });
    const data = await res.json();

    // Not 403 is the actual fix under test — the family member has no
    // reports, so noResultsFound:true from a clean 200 is the expected
    // shape of "access was granted, there's just nothing to find".
    assert.equal(res.status, 200, `expected the family link to be honored, got: ${JSON.stringify(data)}`);
    assert.equal(data.noResultsFound, true);
  } finally {
    if (familyMemberRowId) {
      await deleteFamilyMember(familyMemberRowId, { userId: admin.id });
    }
    await deleteFamilyVaultForUser(admin.id);
    await deleteUserById(admin.id);
    await deleteUserById(member.id);
  }
});
