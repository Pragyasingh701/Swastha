import express from 'express';
import {
  createFamilyMember,
  createOrGetFamilyVaultForUser,
  createPendingFamilyMemberAuthorizationRequest,
  getFamilyVaultForUser,
  getFamilyVaultSummary,
  listFamilyMembers,
  deleteFamilyMember,
  updateFamilyMember,
  confirmPendingFamilyMemberAuthorizationRequest,
  stripEmailTags,
  withEmailTag,
  getMemberEmail,
} from '../db/family.js';
import { sendFamilyMemberAuthorizationEmail } from '../utils/mailer.js';
import { findUserByEmail, findUserById } from '../db/users.js';
import { getAuthUser } from '../config/jwt.js';
import { renderMessagePage, renderConfirmPage } from '../utils/emailActionPage.js';
import { ageFromDob } from '../utils/age.js';

const router = express.Router();

const NAME_REGEX = /^[a-zA-Z\s.'-]{1,80}$/;

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const normalizedEmail = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(normalizedEmail) && normalizedEmail.length <= 254;
}

function isValidName(value) {
  if (!value || typeof value !== 'string') return false;
  return NAME_REGEX.test(value.trim());
}

function isValidDateValue(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateFamilyMemberPayload(payload = {}, options = {}) {
  const { requireName = true, requireEmail = false } = options;
  const errors = {};
  const name = normalizeText(payload.name);
  const relationship = normalizeText(payload.relationship);
  const relationshipTag = normalizeText(payload.relationshipTag);
  const healthOverview = normalizeText(payload.healthOverview);
  const notes = normalizeText(payload.notes);
  const email = normalizeText(payload.email);

  if (requireName && !name) {
    errors.name = 'Member name is required.';
  } else if (name && !isValidName(name)) {
    errors.name = 'Member name contains invalid characters.';
  }

  if (payload.age != null && payload.age !== '') {
    const age = Number(payload.age);
    if (Number.isNaN(age) || !Number.isInteger(age) || age < 0 || age > 150) {
      errors.age = 'Age must be a whole number between 0 and 150.';
    }
  }

  if (relationship && relationship.length > 50) {
    errors.relationship = 'Relationship cannot exceed 50 characters.';
  }

  if (relationshipTag && relationshipTag.length > 50) {
    errors.relationshipTag = 'Relationship tag cannot exceed 50 characters.';
  }

  if (healthOverview && healthOverview.length > 500) {
    errors.healthOverview = 'Health overview cannot exceed 500 characters.';
  }

  if (notes && notes.length > 1000) {
    errors.notes = 'Notes cannot exceed 1000 characters.';
  }

  if (payload.lastVisitDate) {
    if (!isValidDateValue(payload.lastVisitDate)) {
      errors.lastVisitDate = 'Last visit date must be a valid date.';
    } else if (new Date(payload.lastVisitDate) > new Date()) {
      errors.lastVisitDate = 'Last visit date cannot be in the future.';
    }
  }

  if (payload.nextCheckupDate) {
    if (!isValidDateValue(payload.nextCheckupDate)) {
      errors.nextCheckupDate = 'Next checkup date must be a valid date.';
    } else if (payload.lastVisitDate && isValidDateValue(payload.lastVisitDate)) {
      const lastVisit = new Date(payload.lastVisitDate);
      const nextCheckup = new Date(payload.nextCheckupDate);
      if (nextCheckup < lastVisit) {
        errors.nextCheckupDate = 'Next checkup date cannot be earlier than last visit date.';
      }
    }
  }

  if (requireEmail && !email) {
    errors.email = 'Recipient email is required.';
  }

  if (email && !isValidEmail(email)) {
    errors.email = 'Recipient email is not valid.';
  }

  if (payload.conditions != null) {
    if (!Array.isArray(payload.conditions)) {
      errors.conditions = 'Conditions must be a list.';
    } else if (payload.conditions.some((entry) => !normalizeText(entry?.name) || normalizeText(entry.name).length > 100)) {
      errors.conditions = 'Each condition needs a name of 100 characters or fewer.';
    }
  }

  return errors;
}

async function validateDuplicateFamilyMember(userId, payload, excludeMemberId = null) {
  const members = await listFamilyMembers({ userId });
  const normalizedName = normalizeText(payload.name).toLowerCase();
  const normalizedRelationship = normalizeText(payload.relationship).toLowerCase();

  if (normalizedName && normalizedRelationship) {
    const existing = members.find((member) =>
      String(member.id) !== String(excludeMemberId) &&
      normalizeText(member.name).toLowerCase() === normalizedName &&
      normalizeText(member.relationship).toLowerCase() === normalizedRelationship
    );

    if (existing) {
      return 'A family member with the same name and relationship already exists.';
    }
  }

  return null;
}

router.get('/vault', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const vault = await getFamilyVaultForUser(user.userId);
    return res.json({ vault });
  } catch (error) {
    console.error('Family vault lookup error:', error);
    return res.status(500).json({ message: 'Failed to load family vault' });
  }
});

router.post('/vault', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const existingVault = await getFamilyVaultForUser(user.userId);
    if (existingVault) {
      return res.status(200).json({
        message: 'Family vault already exists.',
        vault: existingVault,
        alreadyExists: true,
      });
    }

    const vault = await createOrGetFamilyVaultForUser(user.userId);

    if (vault?.vaultId) {
      const existingMembers = await listFamilyMembers({ userId: user.userId });
      const userProfile = await findUserById(user.userId);
      const profileName = userProfile?.name || userProfile?.fullName || user?.name || user?.fullName || user?.email?.split('@')[0] || 'Me';
      const dob = userProfile?.dob || userProfile?.date_of_birth || null;
      const bloodGroup = userProfile?.bloodGroup || userProfile?.blood_group || null;
      const age = ageFromDob(dob);
      const profileDetails = [dob ? `DOB: ${dob}` : '', bloodGroup ? `Blood Group: ${bloodGroup}` : ''].filter(Boolean).join(' • ');
      const hasSelfMember = existingMembers.some((member) => {
        const relationship = String(member?.relationship || '').trim().toLowerCase();
        const tag = String(member?.relationshipTag || '').trim().toLowerCase();
        const name = String(member?.name || '').trim().toLowerCase();
        return relationship === 'self' || tag === 'self' || name === profileName.trim().toLowerCase();
      });

      if (!hasSelfMember) {
        await createFamilyMember({
          userId: user.userId,
          name: profileName,
          age: age !== null ? age : null,
          relationship: 'Self',
          relationshipTag: 'Self',
          healthOverview: profileDetails || 'Profile details',
          notes: 'Auto-added from user profile',
        });
      }
    }

    return res.status(201).json({
      message: 'Family vault created successfully',
      vault,
    });
  } catch (error) {
    console.error('Create family vault error:', error);
    return res.status(500).json({ message: 'Failed to create family vault' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const vault = await getFamilyVaultForUser(user.userId);
    if (!vault) {
      return res.status(403).json({ message: 'Create a family vault before viewing the summary.' });
    }

    const summary = await getFamilyVaultSummary({ userId: user.userId });
    const members = await listFamilyMembers({ userId: user.userId });

    return res.json({
      members,
      summary: {
        ...summary,
        relationshipTags: summary.relationshipTags,
      },
      relationshipTags: summary.relationshipTags,
      healthOverview: summary.healthOverview,
    });
  } catch (error) {
    console.error('Family vault summary error:', error);
    return res.status(500).json({ message: 'Failed to load Family Vault summary' });
  }
});

async function createMemberHandler(req, res) {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const existingVault = await getFamilyVaultForUser(user.userId);
    if (!existingVault) {
      return res.status(403).json({ message: 'Create a family vault before adding family members.' });
    }

    const payload = {
      name: req.body?.name,
      dob: req.body?.dob,
      age: req.body?.age,
      relationship: req.body?.relationship,
      relationshipTag: req.body?.relationshipTag,
      healthOverview: req.body?.healthOverview,
      // A member added here has no linked account: the client can neither pick
      // its approval state nor attach an email (the [Email: ...] tag in notes
      // is what links a record to a real account, so it's only ever written
      // by the invite-by-email flow below, after that account's owner
      // confirms). Anything of the sort in the body is dropped.
      notes: stripEmailTags(req.body?.notes) || undefined,
      conditions: req.body?.conditions,
      lastVisitDate: req.body?.lastVisitDate,
      nextCheckupDate: req.body?.nextCheckupDate,
      authorizationMethod: 'manual',
    };

    const fieldErrors = validateFamilyMemberPayload(payload, { requireName: true, requireEmail: false });
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ message: 'Validation failed', fieldErrors });
    }

    const duplicateError = await validateDuplicateFamilyMember(user.userId, payload);
    if (duplicateError) {
      return res.status(409).json({ message: duplicateError });
    }

    const member = await createFamilyMember({
      ...payload,
      userId: user.userId,
    });

    return res.status(201).json(member);
  } catch (error) {
    console.error('Add family member error:', error);
    if (error.message?.includes('Family members table is not available')) {
      return res.status(503).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to add family member' });
  }
}

router.post('/members', createMemberHandler);

const FAMILY_INVITE_REPLY =
  'If a patient account exists for that email, an authorization request has been sent. The member will be added once they approve it.';

router.post('/members/authorize', async (req, res) => {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const payload = {
      name: req.body?.name,
      dob: req.body?.dob,
      age: req.body?.age,
      relationship: req.body?.relationship,
      relationshipTag: req.body?.relationshipTag,
      healthOverview: req.body?.healthOverview,
      notes: req.body?.notes,
      conditions: req.body?.conditions,
      email: req.body?.email,
      lastVisitDate: req.body?.lastVisitDate,
      nextCheckupDate: req.body?.nextCheckupDate,
    };

    const fieldErrors = validateFamilyMemberPayload(payload, { requireName: true, requireEmail: true });
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ message: 'Validation failed', fieldErrors });
    }

    const existingVault = await getFamilyVaultForUser(user.userId);
    if (!existingVault) {
      return res.status(403).json({ message: 'Create a family vault before requesting authorization.' });
    }

    const duplicateError = await validateDuplicateFamilyMember(user.userId, payload);
    if (duplicateError) {
      return res.status(409).json({ message: duplicateError });
    }

    const recipientEmail = normalizeText(payload.email);
    // The inviter is always the logged-in account — a client-supplied
    // inviterEmail let anyone send the official "X invited you" email in
    // someone else's name.
    const inviterEmail = user?.email || null;
    const memberName = normalizeText(payload.name);

    const patientAccount = await findUserByEmail(recipientEmail);
    // The reply is the same whether or not the address has a patient account,
    // so this can't be used to check who is registered. If there is no account,
    // nothing is created and nothing is sent.
    if (!patientAccount || patientAccount.role !== 'patient') {
      return res.json({ message: FAMILY_INVITE_REPLY });
    }

    const { member, authorizationToken } = await createPendingFamilyMemberAuthorizationRequest({
      ...payload,
      // The link to the account is the address the token is mailed to,
      // whatever the client wrote in notes — otherwise a request could be
      // mailed to the requester's own second account while the record
      // claims to be someone else's.
      notes: withEmailTag(payload.notes, patientAccount.email),
      userId: user.userId,
      requestedByEmail: inviterEmail,
    });

    try {
      await sendFamilyMemberAuthorizationEmail(recipientEmail, inviterEmail, memberName, authorizationToken);
    } catch (sendError) {
      // Don't leave a pending member behind for an email that was never sent.
      console.error('Failed to send family authorization email:', sendError?.message || sendError);
      try {
        if (member?.id) {
          await deleteFamilyMember(member.id, { userId: user.userId });
        }
      } catch (delErr) {
        console.error('Failed to rollback pending member after email failure:', delErr);
      }
      return res.status(500).json({ message: 'Failed to send authorization email' });
    }

    return res.json({ message: FAMILY_INVITE_REPLY });
  } catch (error) {
    console.error('Family member authorization email error:', error);
    return res.status(500).json({ message: 'Failed to send authorization mail' });
  }
});

// GET only shows a confirmation page: mail scanners and prefetchers open links
// on their own, so opening the link must not grant anything. The button POSTs
// the token back to the same path, and that is what confirms.
router.get('/members/authorize/confirm', (req, res) => {
  const token = String(req.query?.token ?? '').trim();
  if (!token) {
    return renderMessagePage(res, { title: 'Family Vault Permission', heading: 'Missing token', message: 'This link is missing its authorization token.', isError: true });
  }
  return renderConfirmPage(res, {
    title: 'Family Vault Permission',
    heading: 'Give this family member access?',
    message: 'If you confirm, this family member becomes an admin of the family vault and can see and manage your health records.',
    buttonLabel: 'Confirm permission',
    action: `${req.baseUrl}${req.path}`,
    token,
  });
});

router.post('/members/authorize/confirm', express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
  const token = String(req.body?.token ?? '').trim();
  if (!token) {
    return renderMessagePage(res, { title: 'Family Vault Permission', heading: 'Missing token', message: 'This link is missing its authorization token.', isError: true });
  }

  try {
    const confirmedMember = await confirmPendingFamilyMemberAuthorizationRequest(token);
    return renderMessagePage(res, {
      title: 'Family Vault Permission',
      heading: 'Permission Updated',
      message: confirmedMember
        ? 'You gave permission for this family member to become an admin of the family vault.'
        : 'This authorization link is invalid or has already been used.',
      isError: !confirmedMember,
    });
  } catch (error) {
    console.error('Family member authorization confirmation error:', error);
    return renderMessagePage(res, {
      title: 'Family Vault Permission',
      heading: 'Permission Updated',
      message: 'This authorization link is invalid or has already been used.',
      isError: true,
    });
  }
});

async function listMembersHandler(req, res) {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const vault = await getFamilyVaultForUser(user.userId);
    if (!vault) {
      return res.status(403).json({ message: 'Create a family vault before viewing family members.' });
    }

    const members = await listFamilyMembers({
      userId: user.userId,
    });

    return res.json(members);
  } catch (error) {
    console.error('List family members error:', error);
    return res.status(500).json({ message: 'Failed to load Family Vault members' });
  }
}

router.get('/members', listMembersHandler);

async function updateMemberHandler(req, res) {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const vault = await getFamilyVaultForUser(user.userId);
    if (!vault) {
      return res.status(403).json({ message: 'Create a family vault before updating family members.' });
    }

    const existingMembers = await listFamilyMembers({ userId: user.userId });
    const existingMember = existingMembers.find((entry) => String(entry.id) === String(req.params.id));
    if (!existingMember) {
      return res.status(404).json({ message: 'Family member not found.' });
    }

    // Only plain profile fields are editable. Approval state, tokens and the
    // account link are never taken from the body (a member could otherwise
    // approve itself, or be re-pointed at another account's email).
    const EDITABLE_FIELDS = [
      'name', 'dob', 'age', 'relationship', 'relationshipTag', 'parentMemberId',
      'healthOverview', 'conditions', 'lastVisitDate', 'nextCheckupDate',
    ];
    const payload = { userId: user.userId };
    for (const field of EDITABLE_FIELDS) {
      if (req.body?.[field] !== undefined) payload[field] = req.body[field];
    }
    if (req.body?.notes !== undefined) {
      // Keep whatever account link the record already has; ignore any
      // [Email: ...] the client sent.
      payload.notes = withEmailTag(req.body.notes, getMemberEmail(existingMember)) || '';
    }

    const fieldErrors = validateFamilyMemberPayload(payload, { requireName: false, requireEmail: false });
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ message: 'Validation failed', fieldErrors });
    }

    const duplicateError = await validateDuplicateFamilyMember(user.userId, payload, existingMember.id);
    if (duplicateError) {
      return res.status(409).json({ message: duplicateError });
    }

    const member = await updateFamilyMember(req.params.id, payload);

    return res.json(member);
  } catch (error) {
    console.error('Edit family member error:', error);
    return res.status(500).json({ message: 'Failed to update family member' });
  }
}

router.patch('/members/:id', updateMemberHandler);

async function deleteMemberHandler(req, res) {
  try {
    const user = getAuthUser(req);
    if (!user?.userId) {
      return res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    }

    const vault = await getFamilyVaultForUser(user.userId);
    if (!vault) {
      return res.status(403).json({ message: 'Create a family vault before removing family members.' });
    }

    const member = await deleteFamilyMember(req.params.id, {
      userId: user.userId,
    });

    return res.json({ message: 'Family member removed successfully', member });
  } catch (error) {
    console.error('Remove family member error:', error);
    return res.status(500).json({ message: 'Failed to remove family member' });
  }
}

router.delete('/members/:id/delete', deleteMemberHandler);

export default router;
