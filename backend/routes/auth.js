import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { sendOTPEmail, sendPasswordResetEmail } from '../utils/mailer.js';
import { findUserByEmail, findUserById, createOrUpdateUser, updateUserRole, updateUserPassword } from '../db/users.js';
import { getFamilyVaultForUser } from '../db/family.js';

const router = express.Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

if (!global.__otpStore) {
  global.__otpStore = new Map();
}
if (!global.__resetTokenStore) {
  global.__resetTokenStore = new Map();
}

const otpStore = global.__otpStore; // email => { code, expiresAt }
const resetTokenStore = global.__resetTokenStore; // token => { email, expiresAt }

/**
 * Helper to decode / verify Google Credentials
 */
async function decodeGoogleCredential(credential) {
  if (!credential || typeof credential !== 'string') {
    throw new Error('Google credential is required');
  }

  let email;
  let name;
  let picture;
  let sub;

  async function fetchGoogleUserInfo(accessToken) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google userinfo request failed with status ${response.status}`);
    }

    return response.json();
  }

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      email = payload.email;
      name = payload.name;
      picture = payload.picture;
      sub = payload.sub;
    } catch (verifyErr) {
      try {
        const gUser = await fetchGoogleUserInfo(credential);
        email = gUser.email;
        name = gUser.name;
        picture = gUser.picture;
        sub = gUser.sub;
      } catch (fetchErr) {
        const combinedError = new Error(`Google token verification failed: ${verifyErr.message}`);
        combinedError.cause = fetchErr;
        throw combinedError;
      }
    }
  } else {
    try {
      const decoded = jwt.decode(credential);
      if (!decoded) {
        const gUser = await fetchGoogleUserInfo(credential);
        email = gUser.email;
        name = gUser.name;
        picture = gUser.picture;
        sub = gUser.sub;
      } else {
        email = decoded?.email || 'google_user@swastha.app';
        name = decoded?.name || 'Google User';
        picture = decoded?.picture || null;
        sub = decoded?.sub || Date.now();
      }
    } catch (e) {
      const gUser = await fetchGoogleUserInfo(credential);
      email = gUser.email;
      name = gUser.name;
      picture = gUser.picture;
      sub = gUser.sub;
    }
  }

  if (!email) {
    throw new Error('Could not extract valid email from Google credentials');
  }

  return { email, name, picture, sub };
}

/**
 * POST /api/auth/login
 * Email & Password Login -> Sends 6-digit OTP code to email
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return res.status(404).json({ message: 'No account found with this email address. Please create an account first.' });
  }

  // Password Verification
  if (user.password_hash && user.password_hash !== password) {
    return res.status(401).json({ message: 'Incorrect password. Please try again.' });
  }

  // Generate 6-digit OTP code for Login Verification
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(normalizedEmail, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });

  await sendOTPEmail(normalizedEmail, otpCode);

  return res.json({
    requiresOTP: true,
    email: normalizedEmail,
    message: 'Verification code sent to your email.',
  });
});

/**
 * POST /api/auth/register
 * Email & Password Registration -> Creates account, sends 6-digit OTP
 */
router.post('/register', async (req, res) => {
  const { fullName, email, password, role = 'patient', specialty, licenseNumber } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    return res.status(400).json({ accountExists: true, message: 'An account with this email already exists. Please log in instead.' });
  }

  const user = await createOrUpdateUser({
    name: fullName || normalizedEmail.split('@')[0],
    email: normalizedEmail,
    password,
    role,
    specialty,
    licenseNumber,
    authProvider: 'email',
  });

  // Generate 6-digit OTP code for Registration Verification
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(normalizedEmail, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });
  await sendOTPEmail(normalizedEmail, otpCode);

  return res.status(201).json({
    requiresOTP: true,
    email: normalizedEmail,
    message: 'Account created! Verification code sent to your email.',
  });
});

/**
 * POST /api/auth/google-login
 * Google Sign-In on Login Page -> Verifies user exists in DB
 */
router.post('/google-login', async (req, res) => {
  const { credential, token: googleToken, access_token, id_token } = req.body;
  const googleCredential = credential || googleToken || access_token || id_token;
  if (!googleCredential) {
    return res.status(400).json({ message: 'Google credential is required' });
  }

  try {
    const { email } = await decodeGoogleCredential(googleCredential);
    if (!email) {
      return res.status(400).json({ message: 'Could not extract valid email from Google credentials' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(normalizedEmail);

    if (!existingUser) {
      return res.status(404).json({
        isNewUser: true,
        message: 'No account found with this Google email. Please register first.',
      });
    }

    const vault = await getFamilyVaultForUser(existingUser.id);
    const token = jwt.sign({ userId: existingUser.id, email: existingUser.email, role: existingUser.role, vaultId: vault?.vaultId || null }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.json({
      message: 'Google login successful',
      token,
      vaultId: vault?.vaultId || null,
      user: {
        ...existingUser,
        vaultId: vault?.vaultId || null,
        hasSelectedRole: !!(existingUser.role && existingUser.role !== 'none'),
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(401).json({ message: 'Invalid Google authentication token', error: error.message });
  }
});

/**
 * POST /api/auth/google-register
 * Google Sign-Up on Register Page -> Checks if exists, creates account if new
 */
router.post('/google-register', async (req, res) => {
  const { credential, token: googleToken, access_token, id_token, role = 'patient' } = req.body;
  const googleCredential = credential || googleToken || access_token || id_token;
  if (!googleCredential) {
    return res.status(400).json({ message: 'Google credential is required' });
  }

  try {
    const { email, name, picture, sub } = await decodeGoogleCredential(googleCredential);
    if (!email) {
      return res.status(400).json({ message: 'Could not extract valid email from Google credentials' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(normalizedEmail);

    if (existingUser) {
      return res.status(400).json({
        accountExists: true,
        message: 'An account with this email already exists. Please log in instead.',
      });
    }

    const user = await createOrUpdateUser({
      id: 'usr_g_' + (sub || Date.now()),
      email: normalizedEmail,
      name,
      picture,
      role: null,
      hasSelectedRole: false,
      authProvider: 'google',
    });

    const vault = null;
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, vaultId: vault?.vaultId || null }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return res.status(201).json({
      message: 'Google registration successful',
      token,
      vaultId: vault?.vaultId || null,
      user: {
        ...user,
        vaultId: vault?.vaultId || null,
        role: null,
        hasSelectedRole: false,
      },
    });
  } catch (error) {
    console.error('Google registration error:', error);
    return res.status(401).json({ message: 'Invalid Google authentication token', error: error.message });
  }
});

/**
 * Legacy / Fallback POST /api/auth/google route
 */
router.post('/google', async (req, res) => {
  const { credential, token: googleToken, access_token, id_token } = req.body;
  const googleCredential = credential || googleToken || access_token || id_token;
  const { email, name, picture, sub } = await decodeGoogleCredential(googleCredential);
  const normalizedEmail = (email || 'google_user@swastha.app').toLowerCase().trim();
  const existingUser = await findUserByEmail(normalizedEmail);

  const user = await createOrUpdateUser({
    id: existingUser ? existingUser.id : ('usr_g_' + (sub || Date.now())),
    email: normalizedEmail,
    name,
    picture,
    role: existingUser ? existingUser.role : null,
    authProvider: 'google',
  });

  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });

  return res.json({
    message: 'Google auth successful',
    token,
    user: {
      ...user,
      hasSelectedRole: !!(user.role),
    },
  });
});

/**
 * POST /api/auth/verify-otp
 * Verifies 6-digit OTP and logs user in
 */
router.post('/verify-otp', async (req, res) => {
  const { email, otpCode } = req.body;
  if (!otpCode || otpCode.length !== 6) {
    return res.status(400).json({ message: 'Valid 6-digit OTP code is required' });
  }

  const key = email ? email.toLowerCase().trim() : '';
  const stored = otpStore.get(key);
  const isValid = stored && stored.code === otpCode && stored.expiresAt > Date.now();

  if (!isValid) {
    return res.status(400).json({ message: 'Invalid or expired OTP verification code.' });
  }

  otpStore.delete(key);
  let user = await findUserByEmail(key);

  if (!user) {
    user = await createOrUpdateUser({
      email: key,
      name: key.split('@')[0],
      role: 'patient',
      authProvider: 'email',
    });
  }

  const vault = await getFamilyVaultForUser(user.id);
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role, vaultId: vault?.vaultId || null }, JWT_SECRET, {
    expiresIn: '7d',
  });

  return res.json({
    message: 'Verification successful',
    token,
    vaultId: vault?.vaultId || null,
    user: {
      ...user,
      vaultId: vault?.vaultId || null,
      hasSelectedRole: !!(user.role),
    },
  });
});

/**
 * POST /api/auth/role
 */
router.post('/role', async (req, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) {
    return res.status(400).json({ message: 'UserId and role are required' });
  }

  await updateUserRole(userId, role);
  return res.json({ message: 'Role updated successfully', role });
});

/**
 * POST /api/auth/send-otp
 */
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(normalizedEmail, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });

  await sendOTPEmail(normalizedEmail, otpCode);

  return res.json({
    message: `Verification code sent to ${normalizedEmail}`,
  });
});

/**
 * DELETE /api/auth/user
 * Deletes the authenticated user and their family vault data.
 */
router.delete('/user', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return res.status(401).json({ message: 'Authentication required to delete account.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }

    const userId = decoded.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID missing from token.' });
    }

    await deleteFamilyVaultForUser(userId);
    const deleted = await deleteUserById(userId);

    if (!deleted) {
      return res.status(500).json({ message: 'Failed to delete user account.' });
    }

    return res.json({ message: 'Account and family vault data deleted successfully.' });
  } catch (error) {
    console.error('Delete user account error:', error);
    return res.status(500).json({ message: 'Failed to delete account', error: error.message });
  }
});

/**
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Clear any existing reset tokens for this email
  for (const [t, data] of resetTokenStore.entries()) {
    if (data.email.toLowerCase() === normalizedEmail) {
      resetTokenStore.delete(t);
    }
  }

  const resetToken = 'rst_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  resetTokenStore.set(resetToken, { email: normalizedEmail, expiresAt: Date.now() + 30 * 60 * 1000 });

  await sendPasswordResetEmail(normalizedEmail, resetToken);

  return res.json({
    message: `Password reset link sent to ${normalizedEmail}`,
    resetToken,
  });
});

/**
 * GET /api/auth/verify-reset-token
 * Validates if password reset token is still valid (not used and not expired)
 */
router.get('/verify-reset-token', (req, res) => {
  const { token } = req.query;
  if (!token || !resetTokenStore.has(token)) {
    return res.status(400).json({ valid: false, message: 'This password reset link is invalid or has already been used.' });
  }
  const data = resetTokenStore.get(token);
  if (data.expiresAt <= Date.now()) {
    resetTokenStore.delete(token);
    return res.status(400).json({ valid: false, message: 'This password reset link has expired. Please request a new one.' });
  }
  return res.json({ valid: true, email: data.email });
});

/**
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  const { token, email, newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ message: 'New password is required' });
  }

  if (!token || !resetTokenStore.has(token)) {
    return res.status(400).json({ message: 'This password reset link is invalid or has already been used. Please request a new link.' });
  }

  const data = resetTokenStore.get(token);
  if (data.expiresAt <= Date.now()) {
    resetTokenStore.delete(token);
    return res.status(400).json({ message: 'This password reset link has expired. Please request a new link.' });
  }

  const targetEmail = data.email.toLowerCase().trim();

  // Check if new password is the same as previous password
  const existingUser = await findUserByEmail(targetEmail);
  if (existingUser && existingUser.password_hash && existingUser.password_hash === newPassword) {
    return res.status(400).json({ message: 'This password is already being used. Please use a different password.' });
  }

  resetTokenStore.delete(token); // Single-use consumption!

  await updateUserPassword(targetEmail, newPassword);
  return res.json({ message: 'Password reset successfully. You can now login with your new password.' });
});

/**
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = (await findUserById(decoded.userId)) || (await findUserByEmail(decoded.email));
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      user: {
        ...user,
        hasSelectedRole: !!(user.role && user.role !== 'none'),
      },
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

export default router;
