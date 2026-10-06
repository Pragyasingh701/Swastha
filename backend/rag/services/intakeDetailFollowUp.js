// Deterministic "what is the name?" follow-up for the drug_allergy section.
//
// The medications and allergies questions are shaped like yes/no, but what the
// doctor needs is a NAME. A patient who taps "Yes — prescription", types "yes",
// or taps "Food allergies" has told the doctor nothing usable, so the engine
// asks ONE follow-up for the name (the medicine, or what they're allergic to)
// before it counts that field as answered.
//
// This used to be a prompt instruction only, and it never reliably reached the
// patient, because intakeService's own guards treat any non-empty array as a
// finished answer and quietly overrode it:
//   - allergies: drugAllergyComplete() flipped the section to finalize on the
//     bare "yes", and finalize always discards the model's question for the
//     closing message;
//   - medications: the field-key dedup guard read "what medicine is it?" as a
//     re-ask of an already-answered field and swapped in the allergies question.
// So the follow-up is a state machine now. This module holds its pure pieces
// (does this answer name anything? what kind of allergy? what do we ask? what
// did they answer?) with no model call and no imports from intakeService;
// runIntakeTurn owns the state (structured_history.pending_detail) and the guards.

// ── Tokenizing ───────────────────────────────────────────────────────────

// Lowercase, drop apostrophes ("doctor's" -> "doctors"), and split on anything
// that isn't a letter, a combining mark or a digit. Marks must be kept:
// Devanagari vowel signs are combining marks, and splitting on them would
// shred every Hindi word into fragments.
function tokenize(text) {
  return String(text || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

// Punctuation- and case-insensitive identity for a short answer, so a spoken
// "I don't remember." still equals the chip "I don't remember".
const answerKey = (text) => tokenize(text).join(' ');

const wordSet = (words) => new Set(words.map((w) => w.normalize('NFC').toLowerCase()));

// ── "An answer with no name in it" ───────────────────────────────────────

// Words that mean "yes". Latin-script Hindi is here because patients type it
// and speech-to-text returns it.
const YES_WORDS = wordSet([
  'yes', 'yeah', 'yea', 'yep', 'yup', 'y', 'sure', 'correct',
  'haan', 'haa', 'han', 'ha', 'hanji', 'haanji', 'ji', 'jee', 'bilkul',
  'हाँ', 'हां', 'हा', 'हाँजी', 'हांजी', 'जी', 'बिल्कुल',
]);

// Sentence glue, and the how-often / how-many words that dress up a "yes"
// without naming anything ("yes, sometimes").
const GLUE_WORDS = wordSet([
  'i', 'im', 'am', 'do', 'does', 'have', 'has', 'having', 'had', 'take', 'takes',
  'taking', 'took', 'use', 'using', 'on', 'the', 'a', 'an', 'to', 'of', 'for', 'from',
  'at', 'by', 'in', 'some', 'any', 'my', 'me', 'sir', 'madam', 'mam', 'maam', 'please',
  'it', 'is', 'are', 'was', 'be', 'been', 'and', 'with', 'also', 'too', 'currently',
  'now', 'regular', 'regularly', 'daily', 'every', 'day', 'certain', 'something',
  'occasionally', 'sometimes', 'often', 'rarely', 'weekly', 'monthly', 'once', 'twice',
  'few', 'many', 'several', 'one', 'two', 'three',
  // Hindi (Devanagari)
  'से', 'ली', 'हुई', 'हुए', 'की', 'का', 'के', 'में', 'को', 'भी', 'ही', 'किसी', 'कोई',
  'कुछ', 'है', 'हैं', 'हूँ', 'हूं', 'ले', 'लेता', 'लेती', 'लेते', 'रहा', 'रही', 'रहे',
  'मुझे', 'मैं', 'मै', 'रोज', 'रोजाना', 'नियमित', 'वाली', 'वाला', 'वाले', 'कभी', 'अक्सर',
  'लिखी', 'लिखित', 'पीने', 'चीज़', 'चीज', 'चीजें', 'चीज़ें', 'चीजों', 'चीज़ों', 'पदार्थ',
  'पदार्थों',
  // Hindi written in Latin script
  'ki', 'ka', 'ke', 'se', 'li', 'hui', 'hue', 'likhi', 'lekar', 'le', 'leta', 'leti',
  'lete', 'raha', 'rahi', 'rahe', 'hoon', 'hun', 'hai', 'hain', 'mujhe', 'main', 'mein',
  'wali', 'wala', 'roz', 'rozana', 'niyamit', 'kabhi', 'aksar',
]);

// Words for a KIND of medicine or food: what a patient says INSTEAD of a name.
const MEDICINE_WORDS = wordSet([
  'medicine', 'medicines', 'medication', 'medications', 'drug', 'drugs', 'tablet',
  'tablets', 'pill', 'pills', 'dawa', 'dawai', 'dawaiyan', 'dawaiyaan', 'davai', 'davaai',
  'goli', 'golia', 'goliyan',
  'दवा', 'दवाई', 'दवाइयाँ', 'दवाइयां', 'दवाएं', 'दवाएँ', 'गोली', 'गोलियां', 'गोलियाँ',
]);

const FOOD_WORDS = wordSet([
  'food', 'foods', 'eating', 'eat', 'eaten', 'khana', 'khane', 'khaane',
  'खाना', 'खाने', 'खाद्य', 'भोजन',
]);

// The rest of the vocabulary that is about the question's subject rather than
// about any particular medicine or allergen.
const OTHER_TOPIC_WORDS = wordSet([
  'prescription', 'prescriptions', 'prescribed', 'over', 'counter', 'otc', 'doctor',
  'doctors', 'pharmacy', 'chemist', 'store', 'medical', 'supplement', 'supplements',
  'allergy', 'allergies', 'allergic', 'allergen', 'allergens',
  'डॉक्टर', 'डाक्टर', 'मेडिकल', 'एलर्जी', 'एलर्जिक',
]);

const TOPIC_WORDS = new Set([...MEDICINE_WORDS, ...FOOD_WORDS, ...OTHER_TOPIC_WORDS]);

// Reads an answer against the vocabulary above. `bare` is true only when EVERY
// word is one we can vouch for. The list is deliberately conservative: a word
// that isn't on it might be a name, so the answer is left alone. That fails
// safe, because an unusual phrasing is accepted as the answer, as it was
// before this follow-up existed, instead of the patient being asked for a name
// they already gave. No negation ("no", "none", "not", "नहीं", "nahi") is on
// the list, so a negative or "I don't remember" is never bare.
function readAnswer(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { bare: false, yes: false, topic: false };
  let yes = false;
  let topic = false;
  for (const t of tokens) {
    if (YES_WORDS.has(t)) {
      yes = true;
    } else if (TOPIC_WORDS.has(t)) {
      topic = true;
    } else if (!GLUE_WORDS.has(t) && !/^\d+$/.test(t)) {
      return { bare: false, yes: false, topic: false };
    }
  }
  return { bare: true, yes, topic };
}

/**
 * True for an explicit "yes" that names nothing: "Yes — prescription",
 * "Yes — to a food", "yes", "haan ji", "हाँ — किसी दवा से". False for any
 * answer carrying a word that could be a name ("yes, metformin", or a tapped
 * chip plus a typed name: "Yes — prescription, Metformin").
 */
export function isBareYes(text) {
  const read = readAnswer(text);
  return read.bare && read.yes;
}

/**
 * True when an answer is positive but names nothing: a bare yes, OR just a
 * kind of thing with no "yes" in it at all ("Food allergies", "Drug allergies",
 * "Prescription medicines", "Certain foods"). The second shape is the one the
 * model's own quick-reply chips tend to take ("Food allergies" was tapped and
 * the intake closed without asking which food), so a yes-only test misses it.
 * Only ever applied to the answer to the medications or allergies question,
 * where a kind of medicine or food on its own can only mean "yes, that one".
 */
export function isBareAffirmative(text) {
  const read = readAnswer(text);
  return read.bare && (read.yes || read.topic);
}

// ── What kind of allergy? ────────────────────────────────────────────────

/**
 * 'medicine' | 'food' | null, from either a patient's answer ("Yes — to a
 * food") or the question it answered ("Do you have any known drug allergies?").
 * null when the text says neither, or says both: "drug or food allergies" is
 * exactly the main allergy question, which tells us nothing about the answer.
 */
export function allergyKindFromText(text) {
  const tokens = tokenize(text);
  const medicine = tokens.some((t) => MEDICINE_WORDS.has(t));
  const food = tokens.some((t) => FOOD_WORDS.has(t));
  if (medicine && !food) return 'medicine';
  if (food && !medicine) return 'food';
  return null;
}

// ── The follow-up questions ──────────────────────────────────────────────

// Same bank shape as intakeService's DRUG_ALLERGY_FALLBACK_QUESTIONS, and it
// must carry both languages for the same reason (see the note there): these
// replace what the patient sees, so a Hindi session must not drop into English.
// options and options_hi are index-aligned: canonicalDetailChip() relies on
// that to turn a tapped Hindi chip back into its English label.
//
// "I don't remember" is on every one because a patient may genuinely not know
// the name; it is a complete answer, the doctor can check in person. The food
// chips are categories rather than foods: they save a patient who can't, or
// won't, type, and the free-text box stays open for the exact food.
export const DETAIL_QUESTIONS = {
  current_medications: {
    question: 'What are the names of the medicines you are currently taking?',
    question_hi: 'आप जो दवाइयाँ ले रहे हैं, उनके नाम क्या हैं?',
    options: ["I don't remember"],
    options_hi: ['याद नहीं है'],
    allow_multiple: false,
  },
  allergy_medicine: {
    question: 'Which medicine are you allergic to?',
    question_hi: 'आपको किस दवा से एलर्जी है?',
    options: ["I don't remember"],
    options_hi: ['याद नहीं है'],
    allow_multiple: false,
  },
  allergy_food: {
    question: 'Which food are you allergic to?',
    question_hi: 'आपको किस खाने से एलर्जी है?',
    options: ['Veg food', 'Non-veg food', "I don't remember"],
    options_hi: ['शाकाहारी खाना', 'मांसाहारी खाना', 'याद नहीं है'],
    allow_multiple: false,
  },
  // A bare "yes" to "drug or food allergies" doesn't say which, so ask for the
  // allergen itself rather than a second question about its kind.
  allergy_unspecified: {
    question: 'What are you allergic to?',
    question_hi: 'आपको किस चीज़ से एलर्जी है?',
    options: ["I don't remember"],
    options_hi: ['याद नहीं है'],
    allow_multiple: false,
  },
};

const ALLERGY_DETAIL_KEYS = ['allergy_medicine', 'allergy_food', 'allergy_unspecified'];

/**
 * Which DETAIL_QUESTIONS entry a pending follow-up asks.
 * @param {{ field: 'current_medications'|'allergies', kind: 'medicine'|'food'|null }} pending
 */
export function detailKeyFor(pending) {
  if (pending.field === 'current_medications') return 'current_medications';
  if (pending.kind === 'medicine') return 'allergy_medicine';
  if (pending.kind === 'food') return 'allergy_food';
  return 'allergy_unspecified';
}

/**
 * True if this section already asked a name question for `field`, in either
 * language. A field is only ever asked once, so a patient who answers "yes"
 * again, or a main question re-asked after a guard slip, can't start a loop.
 */
export function detailQuestionAlreadyAsked(field, priorQuestions) {
  const keys = field === 'current_medications' ? ['current_medications'] : ALLERGY_DETAIL_KEYS;
  const asked = new Set(
    keys.flatMap((k) => [DETAIL_QUESTIONS[k].question, DETAIL_QUESTIONS[k].question_hi]).map(answerKey)
  );
  return (Array.isArray(priorQuestions) ? priorQuestions : []).some((q) => asked.has(answerKey(q)));
}

/**
 * Decides whether the patient's answer to a MAIN question needs a name
 * follow-up. Returns the pending marker to store in structured_history, or null.
 *
 * @param {object} p
 * @param {string|null} p.answeredField - which field the question just answered
 *   was about (intakeService's fieldForQuestion); anything but the two
 *   follow-up-able fields means there is nothing to ask for
 * @param {string} p.patientMessage
 * @param {string|null} p.lastQuestion - the main question text, a second hint
 *   for the allergy kind when the answer itself doesn't say which
 * @param {string[]} p.priorQuestions - questions already asked in this section
 */
export function pendingDetailFor({ answeredField, patientMessage, lastQuestion, priorQuestions }) {
  if (answeredField !== 'current_medications' && answeredField !== 'allergies') return null;
  if (!isBareAffirmative(patientMessage)) return null;
  if (detailQuestionAlreadyAsked(answeredField, priorQuestions)) return null;

  const kind = answeredField === 'allergies'
    ? allergyKindFromText(patientMessage) || allergyKindFromText(lastQuestion)
    : null;
  return { field: answeredField, kind };
}

// ── Settling the answer ──────────────────────────────────────────────────

/**
 * If `text` is exactly one of the follow-up's chips, in either language,
 * returns that chip's ENGLISH label; otherwise null. The clinical record is
 * English whatever language the patient was spoken to in, and for a tapped
 * chip the exact English text is known, so there is nothing to leave to the
 * model to translate.
 */
export function canonicalDetailChip(text, pending) {
  const spec = DETAIL_QUESTIONS[detailKeyFor(pending)];
  const wanted = answerKey(text);
  if (!wanted) return null;
  for (let i = 0; i < spec.options.length; i += 1) {
    if (answerKey(spec.options[i]) === wanted || answerKey(spec.options_hi[i]) === wanted) {
      return spec.options[i];
    }
  }
  return null;
}

/**
 * The final array for the field after the patient answered its name question.
 *
 * @param {object} p
 * @param {{ field: string, kind: string|null }} p.pending
 * @param {string} p.patientMessage
 * @param {string[]} p.previousValue - what the field held while the name was
 *   owed: the bare "yes" as the model or the extraction rescue recorded it
 * @param {string[]} p.modelValue - what the field holds after this turn's
 *   model output was merged in
 * @returns {string[]} always non-empty
 */
export function resolveDetailValue({ pending, patientMessage, previousValue, modelValue }) {
  const message = String(patientMessage || '').trim();
  const previous = Array.isArray(previousValue) ? previousValue.map(String) : [];

  // A tapped chip is exact, so don't leave it to the model to word.
  const chip = canonicalDetailChip(message, pending);
  if (chip) return [chip];

  // "Yes" again, still no name. They have been asked once; asking again would
  // be a loop, so keep what the record already said. Only an explicit yes
  // counts here: a bare kind ("food") is information, not a refusal.
  if (isBareYes(message)) return previous.length > 0 ? previous : [message];

  // Otherwise trust the model's extraction (it also translates to English),
  // minus any bare-"yes" entry it carried over from the earlier turn.
  const owed = new Set(previous.map(answerKey));
  const named = (Array.isArray(modelValue) ? modelValue.map(String) : [])
    .map((v) => v.trim())
    .filter((v) => v && !owed.has(answerKey(v)) && !isBareYes(v));
  if (named.length > 0) return named;

  // The model extracted nothing: record exactly what the patient said, as the
  // other extraction-miss rescues do. Imperfect, but a name the doctor can
  // read beats a blank, or a "yes" standing in for one.
  return [message];
}
