import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import familyRoutes from './routes/family.js';
import reportsRoutes from './routes/reports.js';

import fs from 'fs';
import path from 'path';

if (fs.existsSync('./backend/.env')) {
  dotenv.config({ path: './backend/.env' });
} else {
  dotenv.config();
}

const app = express();
const DEFAULT_PORT = 5001;
const requestedPort = Number(process.env.PORT) || DEFAULT_PORT;
const tryFallbackPort = process.env.PORT ? null : DEFAULT_PORT + 1;
let currentPort = requestedPort;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve('uploads')));
app.use('/uploads', express.static(path.resolve('backend/uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/reports', reportsRoutes);

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
