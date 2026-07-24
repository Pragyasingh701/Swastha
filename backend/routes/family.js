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

    const vault = await createOrGetFamilyVaultForUser(user.userId);
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

    const member = await createFamilyMember({
      ...req.body,
      userId: user.userId,
    });

    return res.status(201).json(member);
  } catch (error) {
    console.error('Add family member error:', error);
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

    const recipientEmail = req.body?.email?.trim();
    if (!recipientEmail) {
      return res.status(400).json({ message: 'Recipient email is required.' });
    }

    const inviterEmail = req.body?.inviterEmail?.trim() || user?.email || null;
    const memberName = req.body?.name?.trim() || null;

    const { authorizationToken } = await createPendingFamilyMemberAuthorizationRequest({
      ...req.body,
      userId: user.userId,
      requestedByEmail: inviterEmail,
    });

    await sendFamilyMemberAuthorizationEmail(recipientEmail, inviterEmail, memberName, authorizationToken);

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

    const authorizedByEmail = req.query?.email?.trim() || null;
    const confirmedMember = await confirmPendingFamilyMemberAuthorizationRequest(authorizationToken, authorizedByEmail);
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

    const member = await updateFamilyMember(req.params.id, {
      ...req.body,
      userId: user.userId,
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
