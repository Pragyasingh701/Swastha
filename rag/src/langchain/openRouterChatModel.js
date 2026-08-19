// LangChain-compatible wrapper around the existing OpenRouter caller.
//
// Why not @langchain/google-genai with gemini-2.5-flash: this service
// already tried that. See the comment at the top of src/config/gemini.js —
// Gemini's chat models returned "no longer available to new users" 404s
// for these keys, which is why generateGroundedAnswer moved to OpenRouter
// in the first place. Wrapping the working path keeps the conversational
// feature on the same models (and the same 429/503 multi-model fallback)
// that the one-shot endpoint already depends on in production.
//
// SimpleChatModel is the minimal LangChain chat-model contract: implement
// _call(messages) -> string and the rest of the Runnable surface (invoke,
// pipe, batch, streaming shims) comes from the base class.
import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import { generateGroundedAnswer } from '../config/openrouter.js';

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
    // generateGroundedAnswer already walks CHAT_MODELS in order and retries
    // the next model on 429/503, so no retry logic is duplicated here.
    return generateGroundedAnswer(messagesToPrompt(messages));
  }
}

export const chatModel = new OpenRouterChatModel({});
