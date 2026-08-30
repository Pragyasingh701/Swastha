import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import familyRoutes from './routes/family.js';
import reportsRoutes from './routes/reports.js';
import doctorPatientsRoutes from './routes/doctorPatients.js';
import notificationsRoutes from './routes/notifications.js';
import clinicRoutes from './routes/clinic.js';
import intakeAdminRoutes from './routes/intakeAdmin.js';

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
const DEFAULT_PORT = 5001;
const requestedPort = Number(process.env.PORT) || DEFAULT_PORT;
const tryFallbackPort = process.env.PORT ? null : DEFAULT_PORT + 1;
let currentPort = requestedPort;

// Set Security & Cross-Origin-Opener-Policy Headers for Google OAuth
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(cors());
// 2mb limit (not Express's 100kb default): shared with the /rag sub-app,
// whose OCR'd report text can be long.
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.resolve('uploads')));
app.use('/uploads', express.static(path.resolve('backend/uploads')));

// Routes
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

function listenOnPort(port) {
  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      if (tryFallbackPort && port === requestedPort) {
        console.warn(
          `Port ${port} is already in use. Falling back to port ${tryFallbackPort} since PORT was not explicitly set.`
        );
        currentPort = tryFallbackPort;
        listenOnPort(tryFallbackPort);
        return;
      }
      console.error(`Port ${port} is already in use. Please stop the other process or set a different PORT in .env.`);
      process.exit(1);
    }
    console.error('Server error:', error);
    process.exit(1);
  });
}

listenOnPort(currentPort);
