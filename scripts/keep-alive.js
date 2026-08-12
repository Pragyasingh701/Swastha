// Keep-alive script to ping both Backend and RAG services on Render
// to prevent Render's free tier services from sleeping/spinning down.

// Retrieve service URLs from environment variables or use defaults
const BACKEND_URL = process.env.BACKEND_HEALTH_URL || 'https://YOUR-BACKEND-NAME.onrender.com/health';
const RAG_URL = process.env.RAG_HEALTH_URL || 'https://YOUR-RAG-NAME.onrender.com/health';

const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (Render's free tier sleeps after 15 mins)

async function pingService(name, url) {
  try {
    console.log(`[Keep-Alive] Pinging ${name} at ${url}...`);
    const response = await fetch(url);
    if (response.ok) {
      console.log(`[Keep-Alive] ${name} is active: Status ${response.status}`);
    } else {
      console.warn(`[Keep-Alive] ${name} returned warning status: ${response.status}`);
    }
  } catch (error) {
    console.error(`[Keep-Alive] Failed to ping ${name}:`, error.message);
  }
}

function startKeepAlive() {
  console.log(`[Keep-Alive] Starting keep-alive service. Pinging every 14 minutes.`);
  
  // Ping immediately on start
  pingService('Backend', BACKEND_URL);
  pingService('RAG Service', RAG_URL);

  // Set interval
  setInterval(() => {
    pingService('Backend', BACKEND_URL);
    pingService('RAG Service', RAG_URL);
  }, INTERVAL_MS);
}

startKeepAlive();
