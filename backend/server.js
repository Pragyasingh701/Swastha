import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import familyRoutes from './routes/family.js';

import fs from 'fs';

if (fs.existsSync('./backend/.env')) {
  dotenv.config({ path: './backend/.env' });
} else {
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/family', familyRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Swastha Backend', timestamp: new Date() });
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop the other process or set a different PORT in .env.`);
    process.exit(1);
  }
  console.error('Server error:', error);
  process.exit(1);
});
