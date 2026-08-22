import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createFamilyMember,
  createOrGetFamilyVaultForUser,
  createPendingFamilyMemberAuthorizationRequest,
  deleteFamilyVaultForUser,
  getFamilyVaultForUser,
  getFamilyVaultSummary,
  listFamilyMembers,
  deleteFamilyMember,
  updateFamilyMember,
  confirmPendingFamilyMemberAuthorizationRequest,
} from '../db/family.js';
import { sendFamilyMemberAuthorizationEmail } from '../utils/mailer.js';
import { findUserByEmail, findUserById } from '../db/users.js';
import { createNotification } from '../db/notifications.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

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

function getEmailFromMemberData(member = {}) {
  const directEmail = normalizeText(member.email);
  if (directEmail) return directEmail;

  const notes = normalizeText(member.notes);
  const emailMatch = notes.match(/\[Email:\s*([^\]]+)\]/i);
  return normalizeText(emailMatch?.[1]);
}

async function createFamilyChangeNotifications({ ownerId, actorId, member, eventType, message, metadata }) {
  const recipientIds = new Set([ownerId]);
  const memberEmail = getEmailFromMemberData(member);

  if (memberEmail) {
    const memberUser = await findUserByEmail(memberEmail);
    if (memberUser?.id) {
      recipientIds.add(memberUser.id);
    }
  }

  const results = [];
  for (const recipientId of recipientIds) {
    try {
      const notification = await createNotification({
        recipientId,
        actorId,
        actorRole: 'family_admin',
        eventType,
        title: 'Family record updated',
        message,
        metadata,
      });
      results.push(notification);
    } catch (notificationError) {
      console.error('Family notification persist error:', {
        recipientId,
        eventType,
        message: notificationError?.message || notificationError,
      });
    }
  }

  return results;
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

async function validateDuplicateFamilyMember(userId, payload) {
  const members = await listFamilyMembers({ userId });
  const normalizedName = normalizeText(payload.name).toLowerCase();
  const normalizedRelationship = normalizeText(payload.relationship).toLowerCase();

  if (normalizedName && normalizedRelationship) {
    const existing = members.find((member) =>
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
    return res.status(500).json({ message: 'Failed to load family vault', error: error.message });
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
      const age = dob ? (() => {
        const birthDate = new Date(dob);
        if (Number.isNaN(birthDate.getTime())) {
          return null;
        }

        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
          calculatedAge -= 1;
        }
        return calculatedAge;
      })() : null;
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
    return res.status(500).json({ message: 'Failed to create family vault', error: error.message });
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
    return res.status(500).json({ message: 'Failed to load Family Vault summary', error: error.message });
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
      notes: req.body?.notes,
      conditions: req.body?.conditions,
      email: req.body?.email,
      lastVisitDate: req.body?.lastVisitDate,
      nextCheckupDate: req.body?.nextCheckupDate,
      authorizationMethod: req.body?.authorizationMethod || 'mail',
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

    await createFamilyChangeNotifications({
      ownerId: user.userId,
      actorId: user.userId,
      member: { ...payload, ...member },
      eventType: 'family_member_added',
      message: 'A family admin made a change to a family member record.',
      metadata: {
        source: 'family_member_create',
        memberName: payload.name,
        relationship: payload.relationship,
      },
    });

    return res.status(201).json(member);
  } catch (error) {
    console.error('Add family member error:', error);
    if (error.message?.includes('Family members table is not available')) {
      return res.status(503).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to add family member', error: error.message });
  }
}

router.post('/members', createMemberHandler);

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
      inviterEmail: req.body?.inviterEmail,
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
    const inviterEmail = normalizeText(payload.inviterEmail) || user?.email || null;
    const memberName = normalizeText(payload.name);

    const patientAccount = await findUserByEmail(recipientEmail);
    if (!patientAccount || patientAccount.role !== 'patient') {
      return res.status(400).json({
        message: 'This email is not registered as a patient account. Authorization email was not sent.',
        errorCode: 'PATIENT_ACCOUNT_NOT_FOUND',
        errorHint: 'Ask the family member to create a patient account first, then invite them again.',
      });
    }

    const { member, authorizationToken } = await createPendingFamilyMemberAuthorizationRequest({
      ...payload,
      userId: user.userId,
      requestedByEmail: inviterEmail,
    });

    const sent = await sendFamilyMemberAuthorizationEmail(recipientEmail, inviterEmail, memberName, authorizationToken);

    if (!sent) {
      console.error('Failed to send family authorization email to', recipientEmail);
      try {
        if (member?.id) {
          await deleteFamilyMember(member.id, { userId: user.userId });
        }
      } catch (delErr) {
        console.error('Failed to rollback pending member after email failure:', delErr);
      }

      return res.status(500).json({ message: 'Failed to send authorization email' });
    }

    return res.json({ message: 'Authorization request sent. The member will be added after they approve it.' });
  } catch (error) {
    console.error('Family member authorization email error:', error);
    return res.status(500).json({ message: 'Failed to send authorization mail', error: error.message });
  }
});

router.get('/members/authorize/confirm', async (req, res) => {
  try {
    const authorizationToken = req.query?.token?.trim();
    if (!authorizationToken) {
      return res.status(400).send('Missing authorization token.');
    }

    const confirmedMember = await confirmPendingFamilyMemberAuthorizationRequest(authorizationToken);
    const message = confirmedMember
      ? 'You gave permission for this family member to become an admin of the family vault.'
      : 'This authorization link is invalid or has already been used.';

    return res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Family Vault Permission</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); max-width: 560px; text-align: center; }
      h2 { margin-top: 0; color: #2563eb; }
      p { line-height: 1.6; color: #475569; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Permission Updated</h2>
      <p>${message}</p>
    </div>
  </body>
</html>`);
  } catch (error) {
    console.error('Family member authorization confirmation error:', error);
    return res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Family Vault Permission</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08); max-width: 560px; text-align: center; }
      h2 { margin-top: 0; color: #2563eb; }
      p { line-height: 1.6; color: #475569; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Permission Updated</h2>
      <p>This authorization link is invalid or has already been used.</p>
    </div>
  </body>
</html>`);
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
    return res.status(500).json({ message: 'Failed to load Family Vault members', error: error.message });
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

    const payload = {
      ...req.body,
      userId: user.userId,
    };

    const fieldErrors = validateFamilyMemberPayload(payload, { requireName: false, requireEmail: false });
    if (Object.keys(fieldErrors).length > 0) {
      return res.status(400).json({ message: 'Validation failed', fieldErrors });
    }

    const duplicateError = await validateDuplicateFamilyMember(user.userId, payload);
    if (duplicateError) {
      return res.status(409).json({ message: duplicateError });
    }

    const member = await updateFamilyMember(req.params.id, payload);

    await createFamilyChangeNotifications({
      ownerId: user.userId,
      actorId: user.userId,
      member: { ...payload, ...member },
      eventType: 'family_member_updated',
      message: 'A family admin made a change to a family member record.',
      metadata: {
        source: 'family_member_update',
        memberId: req.params.id,
      },
    });

    return res.json(member);
  } catch (error) {
    console.error('Edit family member error:', error);
    return res.status(500).json({ message: 'Failed to update family member', error: error.message });
  }
}

router.put('/members/:id', updateMemberHandler);
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

    await createFamilyChangeNotifications({
      ownerId: user.userId,
      actorId: user.userId,
      member,
      eventType: 'family_member_deleted',
      message: 'A family admin removed a family member record.',
      metadata: {
        source: 'family_member_delete',
        memberId: req.params.id,
      },
    });

    return res.json({ message: 'Family member removed successfully', member });
  } catch (error) {
    console.error('Remove family member error:', error);
    return res.status(500).json({ message: 'Failed to remove family member', error: error.message });
  }
}

router.delete('/members/:id', deleteMemberHandler);
router.delete('/members/:id/delete', deleteMemberHandler);

router.delete('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const result = await deleteFamilyVaultForUser(userId);
    return res.json({
      message: 'Family vault cleanup completed',
      result,
    });
  } catch (error) {
    console.error('Family vault cleanup error:', error);
    return res.status(500).json({ message: 'Failed to clean up family vault', error: error.message });
  }
});

export default router;
