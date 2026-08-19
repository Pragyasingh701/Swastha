import express from 'express';
import cors from 'cors';
import './config/env.js'; // validates required env vars at startup, exits if missing
import { CORS_ORIGIN } from './config/env.js';

import reportsRouter from './routes/reports.js';
import searchRouter from './routes/search.js';
import searchChatRouter from './routes/searchChat.js';
import extractRouter from './routes/extract.js';
import summarizeRouter from './routes/summarize.js';
import labInsightsRouter from './routes/labInsights.js';

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' })); // OCR'd notes can be long

app.get('/health', (req, res) => res.json({ ok: true, service: 'swastha-rag' }));

app.use('/api/reports', reportsRouter);
// Mounted before /api/search so the more specific conversational path
// wins; the one-shot endpoint below is unchanged and still in use.
app.use('/api/search/chat', searchChatRouter);
app.use('/api/search', searchRouter);
app.use('/api/extract', extractRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/lab-insights', labInsightsRouter);

// Central error handler as a last resort net — routes already catch and
// respond themselves, but this guards against anything unhandled.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
