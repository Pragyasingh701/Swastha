// Mounted as a sub-app inside backend/server.js (at /rag) as of the
// backend+rag merge — same process, same port, one Render service. CORS
// and the JSON body parser are applied once by the parent app (with a
// 2mb limit sized for this sub-app's OCR'd report text), not here.
import express from 'express';
import './config/env.js'; // validates required env vars at startup, exits if missing

import reportsRouter from './routes/reports.js';
import searchRouter from './routes/search.js';
import searchChatRouter from './routes/searchChat.js';
import extractRouter from './routes/extract.js';
import summarizeRouter from './routes/summarize.js';
import labInsightsRouter from './routes/labInsights.js';
import patientSummaryRouter from './routes/patientSummary.js';

const app = express();

app.get('/health', (req, res) => res.json({ ok: true, service: 'swastha-rag' }));

app.use('/api/reports', reportsRouter);
// Mounted before /api/search so the more specific conversational path
// wins; the one-shot endpoint below is unchanged and still in use.
app.use('/api/search/chat', searchChatRouter);
app.use('/api/search', searchRouter);
app.use('/api/extract', extractRouter);
app.use('/api/summarize', summarizeRouter);
app.use('/api/lab-insights', labInsightsRouter);
app.use('/api/patient-summary', patientSummaryRouter);

// Central error handler as a last resort net — routes already catch and
// respond themselves, but this guards against anything unhandled.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
