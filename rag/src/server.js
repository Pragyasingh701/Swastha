import app from './app.js';
import { PORT } from './config/env.js';

const server = app.listen(PORT, () => {
  console.log(`[rag] Swastha RAG service listening on port ${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop the other process or set a different PORT in rag/.env.`);
    process.exit(1);
  }
  console.error('Server error:', error);
  process.exit(1);
});
