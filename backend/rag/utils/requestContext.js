// Per-request context (who is calling, which route) carried through async
// calls, so low-level code such as the AI client can record *whose* data was
// sent to *which* provider without every function in between having to pass
// that along. Set by the RAG auth middleware (middleware/auth.js).
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithRequestContext(context, fn) {
  return storage.run(context, fn);
}

export function getRequestContext() {
  return storage.getStore() || null;
}
