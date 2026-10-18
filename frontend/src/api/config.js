// The AI (RAG) API is mounted inside the same backend, at /rag. This is where the
// browser reaches it; VITE_RAG_BASE_URL overrides it for other setups.
export const RAG_BASE_URL = import.meta.env.VITE_RAG_BASE_URL || 'http://localhost:5001/rag/api';
