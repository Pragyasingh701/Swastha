import './utils/asyncErrors.js';
import express from 'express';
import { corsMiddleware } from './middleware/corsConfig.js';
import { limiters } from './middleware/rateLimits.js';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import familyRoutes from './routes/family.js';
import reportsRoutes from './routes/reports.js';
import doctorPatientsRoutes from './routes/doctorPatients.js';
import notificationsRoutes from './routes/notifications.js';
import clinicRoutes from './routes/clinic.js';
import intakeAdminRoutes from './routes/intakeAdmin.js';
import cryptoRoutes from './routes/crypto.js';
import { piiWireBoundary } from './middleware/wireCrypto.js';

import fs from 'fs';
import path from 'path';

if (fs.existsSync('./backend/.env')) {
  dotenv.config({ path: './backend/.env' });
} else {
  dotenv.config();
}

// Dynamic import (not a static one) so this runs after dotenv.config()
// above — static imports are hoisted and would run first, before the
// RAG sub-app's own env validation (backend/rag/config/env.js) sees
// backend/.env's vars. One .env file for the whole merged process now;
// see backend/.env.example for the combined var list.
const { default: ragApp } = await import('./rag/app.js');

const app = express();

// This deploys behind exactly one reverse-proxy hop (Render's own edge —
// see comments elsewhere about the merged backend+rag Render service).
// Without this, req.ip reports the proxy's address for every request, not
// the real client's.
app.set('trust proxy', 1);

// Set Security & Cross-Origin-Opener-Policy Headers for Google OAuth
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(corsMiddleware());
// 2mb limit (not Express's 100kb default): shared with the /rag sub-app,
// whose OCR'd report text can be long.
app.use(express.json({ limit: '2mb' }));

// Wire-format PII encryption boundary (see README's "Wire-format PII
// encryption" section). Must sit after express.json() (it needs the parsed
// body) and before every route below — including the /rag sub-app, which
// inherits it automatically since Express hands a mounted sub-app the same
// req/res the parent already has, with no re-wrapping.
app.use(piiWireBoundary);

// Rate limits (see middleware/rateLimits.js). After the wire boundary so the
// per-email keys can read the decrypted body.
app.use(['/api', '/rag'], limiters.general);
app.post('/api/auth/login', limiters.loginByIpAndEmail, limiters.loginByEmail);
app.post('/api/auth/register', limiters.register, limiters.emailByIp, limiters.emailByEmail);
app.post('/api/auth/send-otp', limiters.emailByIp, limiters.emailByEmail);
app.post('/api/auth/change-password/send-otp', limiters.emailByIp);
app.post('/api/auth/forgot-password', limiters.emailByIp, limiters.forgotByEmail);
app.post('/api/auth/verify-otp', limiters.verifyByIp);
app.post('/api/auth/change-password/verify-otp', limiters.verifyByIp);
app.post('/api/auth/change-password/confirm', limiters.verifyByIp);
app.get('/api/auth/verify-reset-token', limiters.resetByIp);
app.post('/api/auth/reset-password', limiters.resetByIp);
app.post('/api/auth/google/exchange', limiters.googleByIp);
app.post('/api/crypto/handshake', limiters.handshakeByIp);
app.post('/api/doctor-patients/link', limiters.linkByDoctor);

app.use('/uploads', express.static(path.resolve('uploads')));
app.use('/uploads', express.static(path.resolve('backend/uploads')));

// Routes
app.use('/api/crypto', cryptoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/doctor-patients', doctorPatientsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/clinic', clinicRoutes);
// Machine-to-machine only (shared-secret protected, not JWT) — see
// routes/intakeAdmin.js's own comment for why this lives outside the
// normal patient/doctor route boundary.
app.use('/api/intake-admin', intakeAdminRoutes);

// RAG microservice, merged in as a sub-app (was its own process/port/
// Render service; see backend/rag/app.js) so the whole backend runs as
// one Render service and doesn't split free-tier hours across two.
app.use('/rag', ragApp);

// Health check / Keep-alive endpoints for Render & cron-job.org
app.get('/', (req, res) => res.status(200).send('OK'));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/health', (req, res) => res.status(200).send('OK'));

// Last in the chain: anything a route threw or rejected with (see
// utils/asyncErrors.js) ends up here as a clean JSON error instead of Express's
// default HTML page, which also leaks stack traces outside production.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed JSON request body.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body is too large.' });
  }
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

// Backstop: a stray rejection from outside a request (a timer, a floating
// promise) shouldn't take the whole service down either.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

export default app;
