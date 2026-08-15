import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import supabase from '../config/supabase.js';
import { sendOTPEmail, sendPasswordResetEmail } from '../utils/mailer.js';
import { findUserByEmail, findUserById, createOrUpdateUser, updateUserRole, updateUserPassword, deleteUserById } from '../db/users.js';
import { getFamilyVaultForUser, deleteFamilyVaultForUser } from '../db/family.js';
import { deleteAllReportsForUser } from '../db/reports.js';
import { processMedicalCertificate } from '../services/certificateParserService.js';

const router = express.Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '771272691038-s9h707grr3b4ojkgp48aa5vb9tej2sjh.apps.googleusercontent.com';
const JWT_SECRET = process.env.JWT_SECRET || 'swastha_dev_secret_key_2026';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

if (!global.__otpStore) {
  global.__otpStore = new Map();
}
if (!global.__resetTokenStore) {
  global.__resetTokenStore = new Map();
}
if (!global.__passwordChangeTokenStore) {
  global.__passwordChangeTokenStore = new Map();
}

const otpStore = global.__otpStore; // email => { code, expiresAt }
const resetTokenStore = global.__resetTokenStore; // token => { email, expiresAt }
const passwordChangeTokenStore = global.__passwordChangeTokenStore; // token => { email, expiresAt }

// Periodic cleanup to prevent memory leaks from expired OTPs & Reset Tokens
if (!global.__storeCleanupInterval) {
  global.__storeCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of otpStore.entries()) {
      if (data.expiresAt < now) otpStore.delete(key);
    }
    for (const [key, data] of resetTokenStore.entries()) {
      if (data.expiresAt < now) resetTokenStore.delete(key);
    }
    for (const [key, data] of passwordChangeTokenStore.entries()) {
      if (data.expiresAt < now) passwordChangeTokenStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

// Multer Storage Setup for uploaded documents (Certificates, ID Proofs)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB file size limit
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and WEBP files are allowed.'));
    }
  },
});

// Middleware to authenticate JWT bearer tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
};

/**
 * POST /api/auth/upload
 * Document Upload Handler (Medical Registration Certificate & Identity Proof)
 */
router.post('/upload', authenticateToken, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'File upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:5001';
    const fullFileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    const relativeUrl = `/uploads/${req.file.filename}`;
    return res.json({
      message: 'File uploaded successfully',
      url: fullFileUrl,
      relativeUrl: relativeUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
    });
  });
});

/**
 * Helper to decode / verify Google Credentials (handles both OAuth Access Tokens and JWT ID Tokens)
 */
async function decodeGoogleCredential(rawCredential) {
  let credential = rawCredential;
  let clientProfile = null;

  if (typeof rawCredential === 'object' && rawCredential !== null) {
    if (rawCredential.email) {
      clientProfile = {
        email: rawCredential.email,
        name: rawCredential.name,
        picture: rawCredential.picture,
        sub: rawCredential.sub || rawCredential.id,
      };
    }
    credential = rawCredential.credential || rawCredential.access_token || rawCredential.id_token || rawCredential.token;
  }

  let email = clientProfile?.email;
  let name = clientProfile?.name;
  let picture = clientProfile?.picture;
  let sub = clientProfile?.sub;

  if (email) {
    return { email, name, picture, sub };
  }

  if (!credential || typeof credential !== 'string') {
    throw new Error('Google credential is required and must be a valid token or profile object');
  }

  async function fetchGoogleUserInfo(accessToken) {
    const endpoints = [
      'https://www.googleapis.com/oauth2/v3/userinfo',
      'https://www.googleapis.com/oauth2/v2/userinfo',
      'https://www.googleapis.com/userinfo/v2/me',
    ];

    let lastError = null;
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          return await response.json();
        } else {
          const errText = await response.text();
          lastError = new Error(`Endpoint ${url} responded with status ${response.status}: ${errText}`);
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Failed to fetch user profile from Google endpoints');
  }

  const isJwt = credential.split('.').length === 3;

  if (isJwt) {
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
        console.warn('googleClient.verifyIdToken failed, falling back to jwt.decode:', verifyErr.message);
        try {
          const decoded = jwt.decode(credential);
          if (decoded && decoded.email) {
            email = decoded.email;
            name = decoded.name;
            picture = decoded.picture;
            sub = decoded.sub;
          } else {
            throw verifyErr;
          }
        } catch (e) {
          throw verifyErr;
        }
      }
    } else {
      const decoded = jwt.decode(credential);
      if (decoded && decoded.email) {
        email = decoded.email;
        name = decoded.name;
        picture = decoded.picture;
        sub = decoded.sub;
      }
    }
  } else {
    try {
      const gUser = await fetchGoogleUserInfo(credential);
      email = gUser.email;
      name = gUser.name;
      picture = gUser.picture;
      sub = gUser.sub || gUser.id;
    } catch (fetchErr) {
      console.error('Google userinfo fetch failed:', fetchErr.message);
      const decoded = jwt.decode(credential);
      if (decoded && decoded.email) {
        email = decoded.email;
        name = decoded.name;
        picture = decoded.picture;
        sub = decoded.sub;
      } else if (clientProfile?.email) {
        email = clientProfile.email;
        name = clientProfile.name;
        picture = clientProfile.picture;
        sub = clientProfile.sub;
      } else {
        throw new Error(`Google token verification failed: ${fetchErr.message}`);
      }
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

  // Check if account was registered strictly via Google Sign-In (no password created)
  if (!user.password_hash) {
    return res.status(400).json({
      message: 'This account was registered using Google Sign-In. Please click "Continue with Google" to log in.',
      isGoogleUser: true,
    });
  }

  // Password Verification
  if (user.password_hash !== password) {
    return res.status(401).json({ message: 'Incorrect password. Please try again.' });
  }

  // Generate 6-digit OTP code for Login Verification
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(normalizedEmail, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });

  try {
    await sendOTPEmail(normalizedEmail, otpCode);
    return res.json({
      requiresOTP: true,
      email: normalizedEmail,
      message: 'Verification code sent to your email.',
    });
  } catch (error) {
    otpStore.delete(normalizedEmail);
    return res.status(500).json({
      message: 'Failed to send verification email.',
      error: error.message,
    });
  }
});

// Validation helpers for email & phone correctness
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
  // Indian mobile numbers: exactly 10 digits, starting with 6-9
  if (!/^[6-9]\d{9}$/.test(cleaned)) return false;
  if (/^(\d)\1{9}$/.test(cleaned)) return false; // Rejects 6666666666, 9999999999, etc.
  return true;
}

function isValidFullName(name) {
  if (!name || typeof name !== 'string') return false;
  return /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(name.trim());
}

function isValidRegistrationNumber(value) {
  if (!value || typeof value !== 'string') return false;
  return /^(?=.*\d)[A-Za-z0-9/\-\s]{4,30}$/.test(value.trim());
}

function isValidWordsField(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[A-Za-z][A-Za-z .,&-]{1,59}$/.test(value.trim());
}

function isValidFreeTextField(value, { minLength = 3, maxLength = 300 } = {}) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) return false;
  return /[A-Za-z]/.test(trimmed);
}

function isValidPastDate(dateStr, { minAge = 0, maxAge = 120 } = {}) {
  if (!dateStr) return false;
  const dob = new Date(dateStr);
  if (Number.isNaN(dob.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dob > today) return false;

  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= minAge && age <= maxAge;
}

/**
 * POST /api/auth/register
 * Email & Password Registration -> Creates account, sends 6-digit OTP
 */
router.post('/register', async (req, res) => {
  const { fullName, email, password, phone, role = 'none', specialty, licenseNumber } = req.body;
  if (!fullName || !email || !password || !phone) {
    return res.status(400).json({ message: 'Full Name, Email, Phone Number, and Password are all required.' });
  }

  if (!isValidFullName(fullName)) {
    return res.status(400).json({ message: 'Please enter your full name using letters only (2-60 characters).' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address (e.g., name@example.com).' });
  }

  if (!isValidPhone(phone)) {
    return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
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

  try {
    await sendOTPEmail(normalizedEmail, otpCode);
    return res.status(201).json({
      requiresOTP: true,
      email: normalizedEmail,
      message: 'Account created! Verification code sent to your email.',
    });
  } catch (error) {
    otpStore.delete(normalizedEmail);
    return res.status(500).json({
      message: 'Account created, but the verification email could not be sent.',
      error: error.message,
    });
  }
});

/**
 * POST /api/auth/google-login
 * Google Sign-In on Login Page -> Verifies user with Google, creates/updates user, sends 6-digit OTP
 */
router.post('/google-login', async (req, res) => {
  const { credential, token: googleToken, access_token, id_token } = req.body;
  const googleCredential = credential || googleToken || access_token || id_token;
  if (!googleCredential) {
    return res.status(400).json({ message: 'Google credential is required' });
  }

  try {
    const { email, name, picture, sub } = await decodeGoogleCredential(googleCredential, req.body);
    if (!email) {
      return res.status(400).json({ message: 'Could not extract valid email from Google credentials' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(normalizedEmail);

    if (!existingUser) {
      await createOrUpdateUser({
        id: 'usr_g_' + (sub || Date.now()),
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        picture: picture || null,
        role: null,
        hasSelectedRole: false,
        authProvider: 'google',
      });
    }

    // Generate 6-digit OTP code for Google Verification
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(normalizedEmail, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });

    try {
      await sendOTPEmail(normalizedEmail, otpCode);
      return res.json({
        requiresOTP: true,
        email: normalizedEmail,
        message: 'Verification code sent to your Google email address.',
      });
    } catch (error) {
      otpStore.delete(normalizedEmail);
      return res.status(500).json({
        message: 'Could not send the verification email to your Google address.',
        error: error.message,
      });
    }
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(401).json({ message: 'Invalid Google authentication token', error: error.message });
  }
});

/**
 * POST /api/auth/google-register
 * Google Sign-Up on Register Page -> Verifies user with Google, creates/updates user, sends 6-digit OTP
 */
router.post('/google-register', async (req, res) => {
  const { credential, token: googleToken, access_token, id_token, role = 'none' } = req.body;
  const googleCredential = credential || googleToken || access_token || id_token;
  if (!googleCredential) {
    return res.status(400).json({ message: 'Google credential is required' });
  }

  try {
    const { email, name, picture, sub } = await decodeGoogleCredential(googleCredential, req.body);
    if (!email) {
      return res.status(400).json({ message: 'Could not extract valid email from Google credentials' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await findUserByEmail(normalizedEmail);

    if (!existingUser) {
      await createOrUpdateUser({
        id: 'usr_g_' + (sub || Date.now()),
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        picture: picture || null,
        role: role !== 'none' ? role : null,
        hasSelectedRole: false,
        authProvider: 'google',
      });
    }

    // Generate 6-digit OTP code for Google Verification
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(normalizedEmail, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });

    try {
      await sendOTPEmail(normalizedEmail, otpCode);
      return res.status(200).json({
        requiresOTP: true,
        email: normalizedEmail,
        message: 'Verification code sent to your Google email address.',
      });
    } catch (error) {
      otpStore.delete(normalizedEmail);
      return res.status(500).json({
        message: 'Could not send the verification email to your Google address.',
        error: error.message,
      });
    }
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

  // Allow Google login for existing accounts (whether created via email/password or Google)

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
      hasSelectedRole: !!(user.role && user.role !== 'none'),
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
      role: 'none',
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
      hasSelectedRole: !!(user.role && user.role !== 'none'),
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
 * POST /api/auth/profile
 * Updates user profile details (Patient or Doctor registration forms)
 */
router.post('/profile', authenticateToken, async (req, res) => {
  const { email, userId, role, ...profileDetails } = req.body;
  let targetEmail = email || (userId && userId.includes('@') ? userId : null);
  const targetRole = role || profileDetails.role;

  const authEmail = (req.user.email || '').toLowerCase().trim();
  if (!targetEmail && authEmail) {
    targetEmail = authEmail;
  }

  let userToUpdate = null;
  if (targetEmail) {
    userToUpdate = await findUserByEmail(targetEmail);
  } else if (userId) {
    userToUpdate = await findUserById(userId);
  }

  const isSettingsUpdate = Boolean(profileDetails.isSettingsUpdate || profileDetails.isUpdate);
  const isRoleSwitch = Boolean(profileDetails.isRoleSwitch || (userToUpdate && userToUpdate.role !== targetRole));

  // Patient Mandatory Fields Validation (for registration OR role switch to patient)
  if (targetRole === 'patient' && (!isSettingsUpdate || isRoleSwitch)) {
    const { fullName, dob, bloodGroup, phone, gender } = profileDetails;
    const nameVal = fullName || profileDetails.name;
    const phoneVal = phone || profileDetails.mobile;
    const genderVal = gender || profileDetails.gender;
    if (!nameVal || !dob || !bloodGroup || !phoneVal || !genderVal) {
      return res.status(400).json({
        message: 'All patient details (Full Name, Date of Birth, Gender, Blood Group, and Mobile Phone Number) are mandatory when setting up a Patient account.',
      });
    }
    if (nameVal && !isValidFullName(nameVal)) {
      return res.status(400).json({ message: 'Please enter a valid full name using letters only.' });
    }
    if (phoneVal && !isValidPhone(phoneVal)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
    }
    if (dob && !isValidPastDate(dob)) {
      return res.status(400).json({ message: 'Please enter a valid date of birth.' });
    }
  }

  // Doctor Mandatory Fields & Certificate Extraction Pipeline (for registration OR role switch to doctor)
  let extractedCertMeta = {};
  if (targetRole === 'doctor') {
    const { fullName, phone, mobile, dob, regNumber, licenseNumber, council, degree, specialization, specialty, hospitalName, address } = profileDetails;
    const certUrl = profileDetails.regCertificateUrl || profileDetails.reg_certificate_url || profileDetails.certificateUrl || profileDetails.certificate_url;
    const nameVal = fullName || profileDetails.name;
    const phoneVal = phone || mobile;
    const licVal = regNumber || licenseNumber;
    const specVal = specialization || specialty;

    const isNewCertProvided = Boolean(certUrl && certUrl !== userToUpdate?.reg_certificate_url);
    if (!isSettingsUpdate || isRoleSwitch || isNewCertProvided) {
      if (!nameVal || !phoneVal || !dob || !licVal || !council || !degree || !specVal || !hospitalName || !address || !certUrl) {
        return res.status(400).json({
          message: 'All doctor credentials (Full Name, Date of Birth, Mobile Number, Medical Registration #, Council, Degree, Specialization, Hospital/Clinic Name, Practice Address, and Medical Registration Certificate) are mandatory when setting up a Doctor account.',
        });
      }
      if (nameVal && !isValidFullName(nameVal)) {
        return res.status(400).json({ message: 'Please enter a valid full name using letters only.' });
      }
      if (phoneVal && !isValidPhone(phoneVal)) {
        return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
      }
      if (dob && !isValidPastDate(dob, { minAge: 21, maxAge: 100 })) {
        return res.status(400).json({ message: 'Please enter a valid date of birth (doctors must be at least 21 years old).' });
      }
      if (licVal && !isValidRegistrationNumber(licVal)) {
        return res.status(400).json({ message: 'Please enter a valid Medical Registration Number (must include at least one digit).' });
      }
      if (degree && !isValidWordsField(degree)) {
        return res.status(400).json({ message: 'Please enter a valid Primary Degree.' });
      }
      if (specVal && !isValidWordsField(specVal)) {
        return res.status(400).json({ message: 'Please enter a valid Specialization.' });
      }
      if (hospitalName && !isValidFreeTextField(hospitalName, { minLength: 3, maxLength: 150 })) {
        return res.status(400).json({ message: 'Please enter a valid Hospital or Clinic Name.' });
      }
      if (address && !isValidFreeTextField(address, { minLength: 8, maxLength: 300 })) {
        return res.status(400).json({ message: 'Please enter a valid, complete practice address.' });
      }

      // Process & Extract Medical Data from Uploaded Certificate via Gemini Vision AI
      const certAnalysis = await processMedicalCertificate(certUrl, {
        fullName: nameVal,
        regNumber: licVal,
        council,
        degree,
        specialization: specVal,
      });

      if (certAnalysis.isMedicalCertificate === false) {
        return res.status(400).json({
          message: certAnalysis.validationError || 'Uploaded file is not a valid Medical Registration Certificate. Please upload your official medical council certificate.',
        });
      }

      extractedCertMeta = {
        certExtractedData: certAnalysis.extractedData || null,
        licenseExpiryDate: certAnalysis.extractedData?.expiryDate || null,
        verificationStatus: certAnalysis.success ? 'verified' : 'pending',
      };
    }
  }

  try {
    const emailToUse = userToUpdate?.email || targetEmail || profileDetails.email;
    if (!emailToUse) {
      return res.status(400).json({ message: 'User email or ID is required to save profile details.' });
    }

    const isDoctor = (targetRole || userToUpdate?.role) === 'doctor';
    const savedUser = await createOrUpdateUser({
      ...userToUpdate,
      ...profileDetails,
      ...extractedCertMeta,
      email: emailToUse,
      name: profileDetails.name || profileDetails.fullName || userToUpdate?.name,
      fullName: profileDetails.name || profileDetails.fullName || userToUpdate?.fullName,
      phone: profileDetails.phone || profileDetails.mobile || userToUpdate?.phone,
      mobile: profileDetails.phone || profileDetails.mobile || userToUpdate?.mobile,
      dob: profileDetails.dob || profileDetails.dateOfBirth || profileDetails.date_of_birth || userToUpdate?.dob,
      bloodGroup: profileDetails.bloodGroup || profileDetails.blood_group || userToUpdate?.bloodGroup,
      blood_group: profileDetails.bloodGroup || profileDetails.blood_group || userToUpdate?.blood_group,
      gender: profileDetails.gender || userToUpdate?.gender,
      emergencyContact: profileDetails.emergencyContact || profileDetails.emergency_contact || userToUpdate?.emergencyContact,
      address: isDoctor ? (profileDetails.address || profileDetails.hospital_address || userToUpdate?.address) : null,
      hospitalName: isDoctor ? (profileDetails.hospitalName || profileDetails.hospital_name || userToUpdate?.hospitalName) : null,
      hospital_name: isDoctor ? (profileDetails.hospitalName || profileDetails.hospital_name || userToUpdate?.hospital_name) : null,
      specialty: isDoctor ? (profileDetails.specialization || profileDetails.specialty || userToUpdate?.specialty) : null,
      specialization: isDoctor ? (profileDetails.specialization || profileDetails.specialty || userToUpdate?.specialization) : null,
      licenseNumber: isDoctor ? (profileDetails.regNumber || profileDetails.licenseNumber || userToUpdate?.licenseNumber) : null,
      license_number: isDoctor ? (profileDetails.regNumber || profileDetails.licenseNumber || userToUpdate?.license_number) : null,
      regNumber: isDoctor ? (profileDetails.regNumber || profileDetails.licenseNumber || userToUpdate?.regNumber) : null,
      council: isDoctor ? (profileDetails.council || userToUpdate?.council) : null,
      degree: isDoctor ? (profileDetails.degree || userToUpdate?.degree) : null,
      experience: isDoctor ? (profileDetails.experience !== undefined ? profileDetails.experience : userToUpdate?.experience) : null,
      regCertificateUrl: isDoctor ? (profileDetails.regCertificateUrl || profileDetails.reg_certificate_url || userToUpdate?.reg_certificate_url) : null,
      certExtractedData: isDoctor ? (extractedCertMeta.certExtractedData || userToUpdate?.cert_extracted_data) : null,
      licenseExpiryDate: isDoctor ? (extractedCertMeta.licenseExpiryDate || userToUpdate?.license_expiry_date) : null,
      verificationStatus: isDoctor ? (extractedCertMeta.verificationStatus || userToUpdate?.verification_status || 'pending') : 'verified',
      role: targetRole || userToUpdate?.role || 'patient',
      hasSelectedRole: true,
    });

    return res.json({
      message: 'User profile updated successfully',
      extractedCertificateData: extractedCertMeta.certExtractedData || null,
      user: savedUser,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
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

  try {
    await sendOTPEmail(normalizedEmail, otpCode);
    return res.json({
      message: `Verification code sent to ${normalizedEmail}`,
    });
  } catch (error) {
    otpStore.delete(normalizedEmail);
    return res.status(500).json({
      message: 'Failed to send verification code.',
      error: error.message,
    });
  }
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

    // Delete child records first (defensive — works whether or not DB-level
    // ON DELETE CASCADE is configured on reports/vault_table/family_members).
    await deleteAllReportsForUser(userId);
    await deleteFamilyVaultForUser(userId);
    const deleted = await deleteUserById(userId);

    if (!deleted) {
      return res.status(500).json({ message: 'Failed to delete user account.' });
    }

    return res.json({ message: 'Account and all associated records deleted successfully.' });
  } catch (error) {
    console.error('Delete user account error:', error);
    return res.status(500).json({ message: 'Failed to delete account', error: error.message });
  }
});

/**
 * POST /api/auth/change-password/send-otp
 * Sends a 6-digit OTP to the authenticated user's own email to confirm
 * identity before allowing them to change their password from Settings.
 */
router.post('/change-password/send-otp', authenticateToken, async (req, res) => {
  try {
    const email = (req.user.email || '').toLowerCase().trim();
    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }
    if (!user.password_hash) {
      return res.status(400).json({
        message: 'This account was registered using Google Sign-In and does not have a password to change.',
      });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(`changepwd:${email}`, { code: otpCode, expiresAt: Date.now() + 10 * 60 * 1000 });

    try {
      await sendOTPEmail(email, otpCode);
      return res.json({ message: `Verification code sent to ${email}` });
    } catch (error) {
      otpStore.delete(`changepwd:${email}`);
      return res.status(500).json({
        message: 'Failed to send verification code to your email.',
        error: error.message,
      });
    }
  } catch (error) {
    console.error('Change-password send-otp error:', error);
    return res.status(500).json({ message: 'Failed to send verification code', error: error.message });
  }
});

/**
 * POST /api/auth/change-password/verify-otp
 * Verifies the OTP and issues a short-lived, single-use change token that
 * authorizes the following /change-password/confirm call.
 */
router.post('/change-password/verify-otp', authenticateToken, async (req, res) => {
  const { otpCode } = req.body;
  if (!otpCode || otpCode.length !== 6) {
    return res.status(400).json({ message: 'Valid 6-digit OTP code is required' });
  }

  const email = (req.user.email || '').toLowerCase().trim();
  const key = `changepwd:${email}`;
  const stored = otpStore.get(key);
  const isValid = stored && stored.code === otpCode && stored.expiresAt > Date.now();

  if (!isValid) {
    return res.status(400).json({ message: 'Invalid or expired verification code.' });
  }

  otpStore.delete(key);

  const changeToken = 'chg_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  passwordChangeTokenStore.set(changeToken, { email, expiresAt: Date.now() + 10 * 60 * 1000 });

  return res.json({ message: 'Verification successful', changeToken });
});

/**
 * POST /api/auth/change-password/confirm
 * Consumes the change token issued above and sets the new password.
 */
router.post('/change-password/confirm', authenticateToken, async (req, res) => {
  const { changeToken, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
  }

  const email = (req.user.email || '').toLowerCase().trim();
  const data = changeToken ? passwordChangeTokenStore.get(changeToken) : null;

  if (!data || data.email !== email) {
    return res.status(400).json({ message: 'This verification session is invalid. Please verify the OTP again.' });
  }
  if (data.expiresAt <= Date.now()) {
    passwordChangeTokenStore.delete(changeToken);
    return res.status(400).json({ message: 'This verification session has expired. Please verify the OTP again.' });
  }

  const existingUser = await findUserByEmail(email);
  if (existingUser && existingUser.password_hash && existingUser.password_hash === newPassword) {
    return res.status(400).json({ message: 'This password is already being used. Please use a different password.' });
  }

  passwordChangeTokenStore.delete(changeToken); // Single-use consumption!

  await updateUserPassword(email, newPassword);
  return res.json({ message: 'Password updated successfully.' });
});

/**
 * POST /api/auth/forgot-password
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await findUserByEmail(normalizedEmail);

  // 1. Check if the user exists in database records
  if (!existingUser) {
    return res.status(404).json({
      message: 'No registered account found with this email address. Please check your email or create a new account.',
    });
  }

  // 2. Check if account has a password created (Google-only accounts do not use passwords)
  if (!existingUser.password_hash) {
    return res.status(400).json({
      message: 'This account was registered using Google Sign-In and does not have a password. Please log in using "Continue with Google".',
    });
  }

  // Clear any existing reset tokens for this email
  for (const [t, data] of resetTokenStore.entries()) {
    if (data.email.toLowerCase() === normalizedEmail) {
      resetTokenStore.delete(t);
    }
  }

  const resetToken = 'rst_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  resetTokenStore.set(resetToken, { email: normalizedEmail, expiresAt: Date.now() + 30 * 60 * 1000 });

  try {
    await sendPasswordResetEmail(normalizedEmail, resetToken);
    return res.json({
      message: `Password reset link sent to ${normalizedEmail}`,
      resetToken,
    });
  } catch (error) {
    resetTokenStore.delete(resetToken);
    return res.status(500).json({
      message: 'Failed to send password reset email.',
      error: error.message,
    });
  }
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
 * GET /api/auth/users/:userId
 * Looks up an application user by their ID or patient_code.
 */
router.get('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    let user = await findUserById(userId);

    if (!user && supabase) {
      const normalizedUserId = String(userId).trim();
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`id.eq.${normalizedUserId},patient_code.eq.${normalizedUserId}`)
        .maybeSingle();

      if (!error && data) {
        user = data;
      }
    }

    if (!user) {
      return res.status(404).json({ message: 'No user found with this ID.' });
    }

    return res.json({
      user: {
        ...user,
        patientId: user.patient_code || user.id,
        fullName: user.name || user.fullName,
        mobile: user.phone || user.mobile,
        phone: user.phone || user.mobile,
        bloodGroup: user.blood_group || user.bloodGroup || user.blood_type,
        blood_group: user.blood_group || user.bloodGroup || user.blood_type,
        dob: user.dob || user.date_of_birth || user.dateOfBirth,
        licenseNumber: user.license_number || user.licenseNumber || user.regNumber,
        regNumber: user.license_number || user.licenseNumber || user.regNumber,
        specialization: user.specialty || user.specialization,
        specialty: user.specialty || user.specialization,
        hospitalName: user.hospital_name || user.hospitalName,
        hospital_name: user.hospital_name || user.hospitalName,
        hasSelectedRole: !!(user.role && user.role !== 'none'),
      },
    });
  } catch (error) {
    console.error('User lookup error:', error);
    return res.status(500).json({ message: 'Failed to fetch user details.', error: error.message });
  }
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
        fullName: user.name || user.fullName,
        mobile: user.phone || user.mobile,
        phone: user.phone || user.mobile,
        bloodGroup: user.blood_group || user.bloodGroup || user.blood_type,
        blood_group: user.blood_group || user.bloodGroup || user.blood_type,
        dob: user.dob || user.date_of_birth || user.dateOfBirth,
        licenseNumber: user.license_number || user.licenseNumber || user.regNumber,
        regNumber: user.license_number || user.licenseNumber || user.regNumber,
        specialization: user.specialty || user.specialization,
        specialty: user.specialty || user.specialization,
        hospitalName: user.hospital_name || user.hospitalName,
        hospital_name: user.hospital_name || user.hospitalName,
        hasSelectedRole: !!(user.role && user.role !== 'none'),
      },
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
});

export default router;