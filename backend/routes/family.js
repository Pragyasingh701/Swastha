import express from 'express';
import jwt from 'jsonwebtoken';
import {
  createFamilyMember,
  getFamilyDashboard,
  listFamilyMembers,
  removeFamilyMember,
  updateFamilyMember,
} from '../db/family.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';

const TEXT_LIMITS = {
  name: 80,
  relationship: 50,
  relationshipTag: 50,
  healthOverview: 500,
  notes: 1000,
};

function isValidDateString(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function validateFamilyMemberPayload(payload, { partial = false } = {}) {
  const fieldErrors = {};
  const sanitized = {};

  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (!partial || payload?.name !== undefined) {
    if (!name) {
      fieldErrors.name = 'Name is required';
    } else if (name.length < 2) {
      fieldErrors.name = 'Name must be at least 2 characters';
    } else if (name.length > TEXT_LIMITS.name) {
      fieldErrors.name = `Name must be at most ${TEXT_LIMITS.name} characters`;
    } else {
      sanitized.name = name;
    }
  }

  if (payload?.age !== undefined) {
    if (payload.age === '' || payload.age === null) {
      sanitized.age = null;
    } else {
      const age = Number(payload.age);
      if (!Number.isInteger(age) || age < 0 || age > 150) {
        fieldErrors.age = 'Age must be an integer between 0 and 150';
      } else {
        sanitized.age = age;
      }
    }
  }

  const relationship = typeof payload?.relationship === 'string' ? payload.relationship.trim() : '';
  if (payload?.relationship !== undefined) {
    if (relationship.length > TEXT_LIMITS.relationship) {
      fieldErrors.relationship = `Relationship must be at most ${TEXT_LIMITS.relationship} characters`;
    } else if (relationship.length > 0 && relationship.length < 2) {
      fieldErrors.relationship = 'Relationship must be at least 2 characters';
    } else {
      sanitized.relationship = relationship;
    }
  }

  const relationshipTag = typeof payload?.relationshipTag === 'string' ? payload.relationshipTag.trim() : '';
  if (payload?.relationshipTag !== undefined) {
    if (relationshipTag.length > TEXT_LIMITS.relationshipTag) {
      fieldErrors.relationshipTag = `Relationship tag must be at most ${TEXT_LIMITS.relationshipTag} characters`;
    } else if (relationshipTag.length > 0 && relationshipTag.length < 2) {
      fieldErrors.relationshipTag = 'Relationship tag must be at least 2 characters';
    } else {
      sanitized.relationshipTag = relationshipTag;
    }
  }

  const healthOverview = typeof payload?.healthOverview === 'string' ? payload.healthOverview.trim() : '';
  if (payload?.healthOverview !== undefined) {
    if (healthOverview.length > TEXT_LIMITS.healthOverview) {
      fieldErrors.healthOverview = `Health overview must be at most ${TEXT_LIMITS.healthOverview} characters`;
    } else {
      sanitized.healthOverview = healthOverview;
    }
  }

  const notes = typeof payload?.notes === 'string' ? payload.notes.trim() : '';
  if (payload?.notes !== undefined) {
    if (notes.length > TEXT_LIMITS.notes) {
      fieldErrors.notes = `Notes must be at most ${TEXT_LIMITS.notes} characters`;
    } else {
      sanitized.notes = notes;
    }
  }

  if (payload?.lastVisitDate !== undefined) {
    if (!payload.lastVisitDate) {
      sanitized.lastVisitDate = null;
    } else if (!isValidDateString(payload.lastVisitDate)) {
      fieldErrors.lastVisitDate = 'Last visit date must be a valid date';
    } else {
      sanitized.lastVisitDate = payload.lastVisitDate;
    }
  }

  if (payload?.nextCheckupDate !== undefined) {
    if (!payload.nextCheckupDate) {
      sanitized.nextCheckupDate = null;
    } else if (!isValidDateString(payload.nextCheckupDate)) {
      fieldErrors.nextCheckupDate = 'Next checkup date must be a valid date';
    } else {
      sanitized.nextCheckupDate = payload.nextCheckupDate;
    }
  }

  const hasAtLeastOneEditableField =
    sanitized.name !== undefined ||
    sanitized.age !== undefined ||
    sanitized.relationship !== undefined ||
    sanitized.relationshipTag !== undefined ||
    sanitized.healthOverview !== undefined ||
    sanitized.notes !== undefined ||
    sanitized.lastVisitDate !== undefined ||
    sanitized.nextCheckupDate !== undefined;

  if (partial && !hasAtLeastOneEditableField) {
    fieldErrors.form = 'At least one field is required for update';
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    sanitized,
  };
}

function getOwnerContext(req) {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!bearerToken) {
    return null;
  }

  try {
    const payload = jwt.verify(bearerToken, JWT_SECRET);
    return {
      ownerUserId: payload.userId,
      ownerEmail: payload.email || null,
    };
  } catch (error) {
    console.warn('Family route token verification failed:', error.message);
    return null;
  }
}

function requireOwnerContext(req, res) {
  const context = getOwnerContext(req);
  if (!context || !context.ownerUserId) {
    res.status(401).json({ message: 'Authentication required for Family Vault requests.' });
    return null;
  }

  return context;
}

// ─── Edit (update) a family member ──────────────────────────────────────────
router.patch('/members/:memberId', async (req, res) => {
  const context = requireOwnerContext(req, res);
  if (!context) return;

  const validation = validateFamilyMemberPayload(req.body, { partial: true });
  if (!validation.valid) {
    return res.status(400).json({
      message: 'Please correct the highlighted fields',
      fieldErrors: validation.fieldErrors,
    });
  }

  try {
    const member = await updateFamilyMember(context.ownerUserId, req.params.memberId, validation.sanitized);
    res.json({ member });
  } catch (error) {
    console.error('Family member update error:', error);
    res.status(500).json({
      message: error?.message || 'Failed to update family member',
      errorCode: error?.code || null,
      errorHint: error?.hint || null,
      errorDetails: error?.details || null,
    });
  }
});

// ─── Remove a family member ─────────────────────────────────────────────────
// Shared handler used by both DELETE routes
async function handleDeleteFamilyMember(req, res) {
  const context = requireOwnerContext(req, res);
  if (!context) return;

  try {
    await removeFamilyMember(context.ownerUserId, req.params.memberId);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Family member delete error:', error);
    res.status(500).json({
      message: error?.message || 'Failed to remove family member',
      errorCode: error?.code || null,
      errorHint: error?.hint || null,
      errorDetails: error?.details || null,
    });
  }
}

// DELETE /api/family/members/:memberId
router.delete('/members/:memberId', handleDeleteFamilyMember);

// DELETE /api/family/members/:memberId/delete  (frontend uses this path)
router.delete('/members/:memberId/delete', handleDeleteFamilyMember);

// ─── Read routes ─────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  const context = requireOwnerContext(req, res);
  if (!context) return;

  try {
    const dashboard = await getFamilyDashboard(context.ownerUserId);
    res.json(dashboard);
  } catch (error) {
    console.error('Family summary error:', error);
    res.status(500).json({ message: 'Failed to load Family Vault summary' });
  }
});

router.get('/members', async (req, res) => {
  const context = requireOwnerContext(req, res);
  if (!context) return;

  try {
    const members = await listFamilyMembers(context.ownerUserId);
    res.json({ members });
  } catch (error) {
    console.error('Family members list error:', error);
    res.status(500).json({ message: 'Failed to load family members' });
  }
});

// ─── Create a new family member ─────────────────────────────────────────────
router.post('/members', async (req, res) => {
  const context = requireOwnerContext(req, res);
  if (!context) return;

  const validation = validateFamilyMemberPayload(req.body, { partial: false });
  if (!validation.valid) {
    return res.status(400).json({
      message: 'Please correct the highlighted fields',
      fieldErrors: validation.fieldErrors,
    });
  }

  try {
    const member = await createFamilyMember(context.ownerUserId, {
      ...validation.sanitized,
    });

    res.status(201).json({ member });
  } catch (error) {
    console.error('Family member create error:', error);
    res.status(500).json({
      message: error?.message || 'Failed to create family member',
      errorCode: error?.code || null,
      errorHint: error?.hint || null,
      errorDetails: error?.details || null,
    });
  }
});

export default router;