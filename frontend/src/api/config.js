// The AI (RAG) API is mounted inside the same backend, at /rag. This is where the browser
// reaches it. VITE_RAG_BASE_URL sets it directly; otherwise it is worked out from the API
// address (https://api.example.com/api becomes https://api.example.com/rag/api), so a deploy
// that only sets VITE_API_BASE_URL still reaches the AI pages instead of calling localhost.
const apiBase = import.meta.env.VITE_API_BASE_URL;

function defaultRagBaseUrl() {
  if (apiBase) return `${apiBase.replace(/\/api\/?$/, '')}/rag/api`;
  // No API address set: local development talks to the local backend; any other build
  // uses the site's own address.
  return import.meta.env.DEV ? 'http://localhost:5001/rag/api' : '/rag/api';
}

export const RAG_BASE_URL = import.meta.env.VITE_RAG_BASE_URL || defaultRagBaseUrl();
