// LangChain-compatible wrapper around the shared AI failover client.
//
// Previously this called OpenRouter directly, because Gemini's chat models
// were returning "no longer available to new users" 404s for these keys.
// Re-probed 2026-08-19: gemini-flash-lite-latest and gemini-flash-latest
// both answer 200 on the current keys, so runAI now tries Gemini first
// (4 keys of headroom) and falls through to OpenRouter automatically. If
// Gemini regresses to 404 again, MODEL_GONE handling skips it with no
// code change needed.
//
// SimpleChatModel is the minimal LangChain chat-model contract: implement
// _call(messages) -> string and the rest of the Runnable surface (invoke,
// pipe, batch, streaming shims) comes from the base class.
import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import { runAI } from '../config/aiClient.js';

/**
 * Flattens LangChain's message array into the single-user-message prompt
 * shape that generateGroundedAnswer expects. OpenRouter's free models are
 * called through a chat-completions endpoint, but the existing helper
 * composes one user message, so we preserve role labels inline instead of
 * silently dropping them.
 */
function messagesToPrompt(messages) {
  return messages
    .map((m) => {
      const type = m._getType();
      if (type === 'system') return `System instructions:\n${m.content}`;
      if (type === 'human') return `User:\n${m.content}`;
      if (type === 'ai') return `Assistant:\n${m.content}`;
      return String(m.content);
    })
    .join('\n\n');
}

export class OpenRouterChatModel extends SimpleChatModel {
  static lc_name() {
    return 'OpenRouterChatModel';
  }

  _llmType() {
    return 'openrouter-free-fallback';
  }

  async _call(messages) {
    // runAI walks every key, model and provider internally, so no retry
    // logic is duplicated here. On total exhaustion it resolves with the
    // friendly fallback text rather than throwing — SimpleChatModel must
    // return a string, so the degraded sentence becomes the reply and the
    // user sees a graceful message instead of a 500.
    const r = await runAI({ task: 'generation', input: messagesToPrompt(messages), label: 'chat' });
    return r.text;
  }
}

export const chatModel = new OpenRouterChatModel({});
