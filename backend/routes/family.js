import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createFamilyMember,
  createOrGetFamilyVaultForUser,
  deleteFamilyVaultForUser,
  getFamilyVaultForUser,
  getFamilyVaultSummary,
  listFamilyMembers,
  deleteFamilyMember,
  updateFamilyMember,
} from '../db/family.js';

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
