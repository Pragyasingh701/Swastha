// Language the AI should WRITE its answer in, for the text-based Ask Swastha
// endpoints. Separate from ttsService's normalizeLanguage on purpose: intake
// defaults to Hindi (voice layer, Indian OPD context), whereas a request that
// sends no language here must keep behaving exactly as before — English.

const HINDI_INSTRUCTION = `Language: write every human-readable value in your response in Hindi (Devanagari script), even if the question or the records are in English. Keep drug names, doses, units, dates, lab values and numbers exactly as they appear in the records — do not translate or convert them. If a term has no common Hindi equivalent, keep the English term. Do not change the JSON structure or its key names; only the text values are in Hindi.`;

/**
 * Accepts 'hi', 'hi-IN' (the codes the frontend / intake use); everything
 * else — including undefined — falls back to English.
 * @param {unknown} language
 * @returns {'en'|'hi'}
 */
export function normalizeResponseLanguage(language) {
  return typeof language === 'string' && language.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

/**
 * Prompt fragment telling the model which language to answer in. Empty for
 * English so existing prompts (and their tests) are byte-for-byte unchanged.
 * @param {unknown} language
 * @returns {string}
 */
export function languageInstruction(language) {
  return normalizeResponseLanguage(language) === 'hi' ? `\n\n${HINDI_INSTRUCTION}` : '';
}
