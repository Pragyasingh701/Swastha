// Conversation memory, scoped by session_id.
//
// Swappable-store design: every consumer goes through the four functions
// exported at the bottom (getHistory / appendTurn / clearSession /
// touchSession). Moving to Redis/Postgres later means reimplementing this
// one file against the same four signatures — no call-site changes. The
// functions are async for exactly that reason, even though the in-memory
// implementation resolves immediately.
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// session_id -> { history, userId, lastAccess }
const sessions = new Map();

// A session is a doctor's chat about one patient. Two limits keep this
// bounded, since an in-process Map has no eviction of its own:
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour idle -> dropped
const MAX_TURNS = 10; // keep the last N Q&A pairs in the condense prompt

function pruneExpired() {
  const now = Date.now();
  for (const [sessionId, entry] of sessions) {
    if (now - entry.lastAccess > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      console.log(`[sessionStore] expired idle session ${sessionId}`);
    }
  }
}

/**
 * Returns the message history for a session, creating it on first use.
 *
 * SECURITY: a session is bound to the user_id that created it. If a
 * different user presents the same session_id, this throws rather than
 * serving them another patient's conversation — session_id is
 * client-supplied and therefore guessable/forgeable on its own.
 */
async function getSession(sessionId, userId) {
  pruneExpired();

  let entry = sessions.get(sessionId);

  if (!entry) {
    entry = { history: new InMemoryChatMessageHistory(), userId, lastAccess: Date.now() };
    sessions.set(sessionId, entry);
    console.log(`[sessionStore] created session ${sessionId} for user ${userId}`);
    return entry;
  }

  if (entry.userId !== userId) {
    throw new Error('sessionStore: session_id belongs to a different user');
  }

  entry.lastAccess = Date.now();
  return entry;
}

/** Chat history as a LangChain message array, oldest first, capped to MAX_TURNS pairs. */
export async function getHistory(sessionId, userId) {
  const entry = await getSession(sessionId, userId);
  const messages = await entry.history.getMessages();
  return messages.slice(-MAX_TURNS * 2);
}

/** Records one completed exchange. Only called after a successful answer. */
export async function appendTurn(sessionId, userId, question, answer) {
  const entry = await getSession(sessionId, userId);
  await entry.history.addMessage(new HumanMessage(question));
  await entry.history.addMessage(new AIMessage(answer));
}

/**
 * Drops a session's memory entirely.
 * @returns {boolean} whether a session existed to clear.
 */
export async function clearSession(sessionId, userId) {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  if (entry.userId !== userId) {
    throw new Error('sessionStore: session_id belongs to a different user');
  }
  await entry.history.clear();
  sessions.delete(sessionId);
  console.log(`[sessionStore] cleared session ${sessionId}`);
  return true;
}

/** Diagnostics only — current live session count. */
export function sessionCount() {
  return sessions.size;
}

export { SESSION_TTL_MS, MAX_TURNS };
