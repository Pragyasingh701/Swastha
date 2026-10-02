// Kept in its OWN file, separate from ask-swastha-family-vault-access.test.js:
// this test calls isPatientLinkedToFamilyMember directly (no HTTP server, no
// requireAuth/requireNoticeAck involved) — unlike that file's other two
// tests, which hit the real app over fetch(). Mixing this test into that
// file made it silently vanish from the TAP report (no ok/not ok line, no
// assertion failure, just absent from the final tally) every time it ran
// alongside the server-dependent tests and that file's after() hook's
// process.exit(0) — reproduced directly against this exact same logic run
// as a plain script (outside node:test) succeeding every time, which is
// what isolated the cause to node:test scheduling/exit interaction in that
// file rather than this test's own logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOrUpdateUser, deleteUserById } from '../db/users.js';
import {
  createOrGetFamilyVaultForUser,
  createPendingFamilyMemberAuthorizationRequest,
  deleteFamilyVaultForUser,
  isPatientLinkedToFamilyMember,
} from '../db/family.js';
import supabase from '../config/supabase.js';

test('isPatientLinkedToFamilyMember returns false for a PENDING (not yet accepted) family-member invite', async () => {
  const suffix = Date.now();
  const admin = await createOrUpdateUser({
    id: `usr_fampending_${suffix}`,
    email: `fam-pending-admin-${suffix}@example.com`,
    name: 'Pending Family Admin Test',
    role: 'patient',
    phone: '9876500006',
    dob: '1985-01-01',
    gender: 'Female',
    bloodGroup: 'O+',
    authProvider: 'email',
  });
  const invitee = await createOrUpdateUser({
    id: `usr_famInvitee_${suffix}`,
    email: `fam-pending-invitee-${suffix}@example.com`,
    name: 'Pending Family Invitee Test',
    role: 'patient',
    phone: '9876500007',
    dob: '2000-01-01',
    gender: 'Male',
    bloodGroup: 'A+',
    authProvider: 'email',
  });

  let familyMemberRowId = null;
  try {
    await createOrGetFamilyVaultForUser(admin.id);
    // Returns { member, authorizationToken } — NOT a bare member object like
    // createFamilyMember does; member.id, not createdMember.id directly.
    const { member: createdMember } = await createPendingFamilyMemberAuthorizationRequest({
      userId: admin.id,
      name: invitee.name,
      notes: `[Email: ${invitee.email}]`,
      relationship: 'Sibling',
    });
    familyMemberRowId = createdMember.id;

    const linked = await isPatientLinkedToFamilyMember(admin.id, invitee.id);
    assert.equal(linked, false, 'a pending (not yet accepted) invite must NOT grant access');
  } finally {
    if (familyMemberRowId) {
      await supabase.from('family_members').delete().eq('id', familyMemberRowId);
    }
    await deleteFamilyVaultForUser(admin.id);
    await deleteUserById(admin.id);
    await deleteUserById(invitee.id);
  }
});
