// Module A — Conversational History Engine: text-only dialogue engine.
//
// State machine over sections: chief_complaint -> hpi (SOCRATES) [->
// ayurveda_profile, ayurvedic sessions only] -> drug_allergy -> finalize.
// One runAI('intake-dialogue') call per patient turn returns forced JSON
// with the next question, updated structured_history fields, and an
// independent red-flag check (PRD §6.1 — red-flag check runs on every turn
// regardless of section progress).
//
// Never suggests a diagnosis — the prompt is deliberately restricted to
// asking follow-ups and structuring what the patient said, per PRD §4 (no
// autonomous diagnosis) and §6.1. This constraint is NOT relaxed for the
// Ayurvedic path (Treatment-Method-Aware Intake PRD §4.1).
//
// Treatment-method branching (Treatment-Method-Aware Intake PRD §4.1): the
// session's intake_method — snapshotted at session creation from the
// doctor's own registered treatment_method, never patient-chosen, never
// re-derived on read — decides which section flow and prompt a session
// gets. Allopathic sessions are 100% unchanged from before this feature.
import { supabase } from '../config/supabase.js';
import { runAI } from '../config/aiClient.js';
import {
  AYURVEDA_SUBSECTIONS,
  AYURVEDA_FIELD_GROUPS,
  AYURVEDA_ARRAY_FIELDS,
  AYURVEDA_SKIPPABLE_FIELDS,
} from './intakeQuestions.js';

// First-pass red-flag trigger list (PRD §6.1, confirmed with the user before
// being hardcoded here). Not exhaustive — a deliberately short starter set
// covering the most common OPD emergencies: cardiac, respiratory, neuro
// (stroke signs), severe bleeding, loss of consciousness, acute abdomen,
// meningitic signs, suicidal ideation, and severe allergic reaction. Kept as
// a documented list (not scattered inline) so it's easy to review/extend
// later without touching the prompt-building code around it.
const RED_FLAG_TRIGGERS = [
  'chest pain radiating to the arm or jaw, or with sweating or breathlessness',
  'sudden severe headache ("worst headache of my life")',
  "severe difficulty breathing / can't complete a sentence",
  'sudden one-sided weakness, numbness, or slurred speech (stroke signs)',
  "severe or uncontrolled bleeding that won't stop",
  'loss of consciousness / fainting',
  'severe abdominal pain with a rigid, board-like abdomen',
  'high fever with a stiff neck or confusion',
  'suicidal ideation or mention of self-harm',
  'severe allergic reaction signs (throat swelling, difficulty swallowing) after a new medicine or food',
];

// SOCRATES fields the hpi section must fill before section_complete can be
// true for that section. Nested under structured_history.hpi (schema
// confirmed with the user) — a single jsonb blob, no further normalization,
// per PRD §7. Unchanged by the Ayurvedic branch — ayurvedic sessions still
// collect hpi (Treatment-Method-Aware Intake PRD §4.1 confirmed: ayurvedic
// keeps SOCRATES HPI and adds ayurveda_profile on top, doesn't replace it).
const HPI_FIELDS = [
  'site',
  'onset',
  'character',
  'radiation',
  'associated_symptoms',
  'timing',
  'exacerbating_relieving',
  'severity',
];

// Keyword sets per SOCRATES field, used ONLY by the hpi repeat-guard below
// to figure out which field a repeated question was actually ABOUT — since
// hpi questions are model-generated free text (no fixed question bank like
// intakeQuestions.js's Ayurveda set), there's no canonical string to match
// against, so this substitutes content keywords instead. Fixes a real bug:
// the guard used to just grab "first empty field in HPI_FIELDS order",
// which silently back-filled the WRONG field whenever more than one field
// was empty and the repeat wasn't about the first one (the common case —
// HPI has 8 fields that fill in gradually, so "first empty" is rarely the
// field actually being re-asked about). Order matters where terms overlap
// (checked top to bottom, first match wins) — e.g. "severity"/"scale" must
// be checked before the generic "character" bucket so "how bad" style
// severity questions don't get miscategorized as character.
const HPI_FIELD_KEYWORDS = [
  ['severity', ['severity', 'scale', 'how bad', 'how severe', 'out of 10', '1-10', '1 to 10']],
  // "first notice"/"since when" sit here (before timing) so an onset question
  // isn't swallowed by timing's day-pattern terms below.
  ['onset', ['onset', 'when did', 'first notice', 'first start', 'first began', 'since when', 'how long', 'how many days', 'start', 'began', 'duration']],
  ['radiation', ['radiat', 'spread', 'move to', 'travel']],
  ['exacerbating_relieving', ['better', 'worse', 'trigger', 'relieve', 'aggravat', 'ease', 'bring it on', 'set it off']],
  // 'throughout the day'/'behave'/'all day'/'overall' added after observing a
  // live miss: "Which of the following describes how your symptoms behave
  // overall throughout the day?" matched NOTHING here, so the duplicate guard
  // had no field to compare and shipped it as a third timing question.
  ['timing', ['timing', 'constant', 'comes and goes', 'come and go', 'pattern', 'time of day', 'throughout the day', 'during the day', 'all day', 'behave', 'overall', 'how often', 'frequency', 'intermittent']],
  ['associated_symptoms', ['associated', 'along with', 'other symptoms', 'also experienc', 'accompan', 'anything else']],
  ['character', ['character', 'describe the', 'what does it feel', 'feel like', 'type of', 'quality', 'burning', 'sharp', 'dull']],
  ['site', ['where', 'location', 'site', 'which part', 'which area']],
];

// Maps a repeated hpi question to the field it's actually about, by keyword
// match against the question text — falls back to null (guard does nothing)
// rather than guessing wrong, since a silent wrong-field write is worse
// than not back-filling at all.
function hpiFieldForQuestion(questionText) {
  const lower = (questionText || '').toLowerCase();
  for (const [field, keywords] of HPI_FIELD_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return field;
  }
  return null;
}

// Complaints that are generalized/systemic rather than localized. For these,
// two SOCRATES fields are clinically meaningless and must never be asked:
// "site" (fatigue has no location) and "radiation" (nothing to radiate).
// Added after a live session substituted the site fallback and asked
// "Where exactly is the Fatigue or low energy?" with
// ["One specific spot","A general area",...] — a nonsensical question the
// patient can't answer.
const SYSTEMIC_COMPLAINT_TERMS = [
  'fatigue', 'tired', 'low energy', 'weak', 'weakness', 'lethargy', 'malaise',
  'fever', 'chills', 'nausea', 'vomit', 'dizz', 'lightheaded', 'faint',
  'insomnia', 'sleepless', "can't sleep", 'cant sleep', 'sleep', 'appetite',
  'weight loss', 'weight gain', 'anxiety', 'depress', 'stress', 'mood',
  'palpitation', 'sweating', 'night sweats',
];

// HPI fields that don't apply to a generalized/systemic complaint.
const HPI_FIELDS_NA_FOR_SYSTEMIC = ['site', 'radiation'];
const HPI_NA_MARKER = 'Not applicable (generalized symptom)';

function isSystemicComplaint(chiefComplaint) {
  const c = String(chiefComplaint || '').toLowerCase();
  if (!c.trim()) return false;
  // A localized pain complaint mentioning a body part is NOT systemic even
  // if it also mentions e.g. weakness ("pain in right arm with weakness").
  const localized = /\b(pain|ache|swelling|rash|itch|lump|injur|sprain|burn|wound|cut)\b/.test(c);
  if (localized) return false;
  return SYSTEMIC_COMPLAINT_TERMS.some((t) => c.includes(t));
}

// Returns a copy of the history with site/radiation explicitly marked
// not-applicable when the complaint is systemic. Marking (rather than just
// skipping) is required because hpiComplete() demands every field be
// non-empty — skipping alone would strand the session in "hpi" forever.
// The marker also flows into capturedFieldKeys(), so the prompt lists these
// as ALREADY ANSWERED and the model won't ask them either.
function markInapplicableHpiFields(history) {
  if (!history?.hpi || !isSystemicComplaint(history.chief_complaint)) return history;
  let changed = false;
  const hpi = { ...history.hpi };
  for (const f of HPI_FIELDS_NA_FOR_SYSTEMIC) {
    if (!(typeof hpi[f] === 'string' && hpi[f].trim() !== '')) {
      hpi[f] = HPI_NA_MARKER;
      changed = true;
    }
  }
  return changed ? { ...history, hpi } : history;
}

// Which field a drug_allergy question is about, by keyword. That section
// only has two turn-worthy questions, so simple term matching is enough.
function drugAllergyFieldForQuestion(questionText) {
  const t = String(questionText || '').toLowerCase();
  if (/allerg/.test(t)) return 'allergies';
  if (/medicat|medicine|prescription|taking any|drugs you/.test(t)) return 'current_medications';
  return null;
}

// Section-aware "what field is this question actually about?", inferred from
// the question TEXT rather than the model's self-reported target_field.
// Previously this existed for hpi only, which left drug_allergy and
// ayurveda_profile with no text-based duplicate signal at all — that is how
// "Do you have any known drug allergies?" and, two turns later, "Do you have
// any known drug or food allergies?" both shipped.
function fieldForQuestion(section, questionText, intakeMethod) {
  if (section === 'hpi') return hpiFieldForQuestion(questionText);
  if (section === 'drug_allergy') return drugAllergyFieldForQuestion(questionText);
  if (section === 'ayurveda_profile' && intakeMethod === 'ayurvedic') {
    const match = AYURVEDA_QUESTION_INDEX.find((q) => questionsLookRepeated(q.question, questionText));
    return match ? match.field : null;
  }
  return null;
}

// Deterministic fallback question + options per SOCRATES field, used when
// the model tries to re-ask a field that's ALREADY captured (see the dedup
// guard in runIntakeTurn). Unlike ayurveda_profile — which has a real
// question bank in intakeQuestions.js — hpi questions are normally
// model-generated per complaint, so without this there'd be nothing to
// substitute in when a repeat is caught, and the only options would be
// another AI round-trip (slow — see aiClient.js's intake-dialogue timeout
// note) or shipping the duplicate.
//
// `{complaint}` is replaced with the session's chief_complaint so the
// substituted question still reads naturally ("Where exactly is the back
// pain?"). Options are deliberately generic-but-tappable: the model's own
// contextual options are always preferred, these only appear on the
// fallback path. Free text stays available alongside them either way (the
// chat UI always renders its text input), so these never have to be
// exhaustive.
// Deterministic question banks used when the model's own next_question has
// to be replaced — the dedup guard (it re-asked an already-answered field)
// and the options backfill. These REPLACE what the patient sees, so they
// must exist in every language the session can be in: a Hindi session that
// hits the dedup guard would otherwise show one hardcoded English question
// in an otherwise all-Hindi conversation (observed in testing). Options are
// localized alongside the question — a Hindi question with English chips is
// the same bug half-fixed.
//
// {complaint} is substituted with the patient's chief complaint, which is
// stored in ENGLISH (it is the doctor-facing record). So the Hindi
// templates deliberately do NOT use that placeholder — interpolating it
// produced half-English questions like "Abdominal pain के साथ और कुछ
// महसूस हो रहा है?" (seen in testing). They say "यह तकलीफ़" instead,
// which reads naturally because the question always follows the
// patient's own description of the problem.
const HPI_FALLBACK_QUESTIONS = {
  site: {
    question: 'Where exactly is the {complaint}?',
    question_hi: 'यह तकलीफ़ ठीक किस जगह पर है?',
    options: ['One specific spot', 'A general area', 'Moves around', 'Not sure'],
    options_hi: ['एक ही जगह पर', 'थोड़े बड़े हिस्से में', 'जगह बदलता रहता है', 'पता नहीं'],
    allow_multiple: false,
  },
  onset: {
    question: 'When did the {complaint} start?',
    question_hi: 'यह तकलीफ़ कब से शुरू हुई?',
    options: ['Today', '2-3 days ago', 'About a week ago', 'More than a month ago'],
    options_hi: ['आज से', '2-3 दिन पहले से', 'लगभग एक हफ्ते से', 'एक महीने से ज़्यादा'],
    allow_multiple: false,
  },
  character: {
    question: 'How would you describe the {complaint}?',
    question_hi: 'यह तकलीफ़ कैसी महसूस होती है?',
    options: ['Sharp', 'Dull or aching', 'Burning', 'Cramping', 'Other'],
    options_hi: ['चुभने वाला', 'हल्का या भारी दर्द', 'जलन जैसा', 'मरोड़ वाला', 'अन्य'],
    allow_multiple: false,
  },
  radiation: {
    question: 'Does the {complaint} spread anywhere else?',
    question_hi: 'क्या यह तकलीफ़ शरीर के किसी और हिस्से तक जाती है?',
    options: ['No, stays in one place', 'Yes, spreads nearby', 'Not sure'],
    options_hi: ['नहीं, एक ही जगह रहता है', 'हाँ, आस-पास फैलता है', 'पता नहीं'],
    allow_multiple: false,
  },
  associated_symptoms: {
    question: 'Have you noticed anything else along with the {complaint}?',
    question_hi: 'इसके साथ और कुछ महसूस हो रहा है?',
    options: ['Fever', 'Nausea or vomiting', 'Swelling', 'Weakness', 'Nothing else'],
    options_hi: ['बुखार', 'मितली या उल्टी', 'सूजन', 'कमजोरी', 'और कुछ नहीं'],
    allow_multiple: true,
  },
  timing: {
    question: 'Is the {complaint} constant, or does it come and go?',
    question_hi: 'क्या यह तकलीफ़ लगातार रहती है या आती-जाती है?',
    options: ['Constant', 'Comes and goes', 'Worse at certain times', 'Not sure'],
    options_hi: ['लगातार रहता है', 'आता-जाता है', 'कुछ समय पर ज़्यादा होता है', 'पता नहीं'],
    allow_multiple: false,
  },
  exacerbating_relieving: {
    question: 'Does anything make the {complaint} better or worse?',
    question_hi: 'किसी चीज़ से यह तकलीफ़ बढ़ती या कम होती है?',
    options: ['Worse with movement', 'Better with rest', 'Worse at night', 'Nothing changes it'],
    options_hi: ['चलने-फिरने से बढ़ता है', 'आराम करने से कम होता है', 'रात में ज़्यादा होता है', 'किसी चीज़ से फर्क नहीं पड़ता'],
    allow_multiple: false,
  },
  severity: {
    question: 'On a scale of 1 to 10, how severe is the {complaint}?',
    question_hi: '1 से 10 के बीच, यह तकलीफ़ कितनी तेज़ है?',
    options: ['1-3 (mild)', '4-6 (moderate)', '7-8 (severe)', '9-10 (worst imaginable)'],
    options_hi: ['1-3 (हल्का)', '4-6 (मध्यम)', '7-8 (तेज़)', '9-10 (बहुत ज़्यादा)'],
    allow_multiple: false,
  },
};

const DRUG_ALLERGY_FALLBACK_QUESTIONS = {
  current_medications: {
    question: 'Are you currently taking any medications?',
    question_hi: 'क्या आप अभी कोई दवा ले रहे हैं?',
    options: ['None', 'Yes — prescription', 'Yes — over the counter', 'Not sure'],
    options_hi: ['कोई नहीं', 'हाँ — डॉक्टर की लिखी दवा', 'हाँ — मेडिकल से ली हुई दवा', 'पता नहीं'],
    allow_multiple: false,
  },
  allergies: {
    question: 'Do you have any known drug or food allergies?',
    question_hi: 'क्या आपको किसी दवा या खाने से एलर्जी है?',
    options: ['No known allergies', 'Yes — to a medicine', 'Yes — to a food', 'Not sure'],
    options_hi: ['कोई एलर्जी नहीं', 'हाँ — किसी दवा से', 'हाँ — किसी खाने से', 'पता नहीं'],
    allow_multiple: false,
  },
};

/**
 * Picks the language-appropriate question/options out of a bank entry.
 * Falls back to English if a Hindi variant is somehow missing, so a new
 * un-translated entry degrades to "wrong language" rather than "undefined".
 */
function localizeSpec(spec, language) {
  if (!spec) return null;
  const hi = language === 'hi-IN';
  return {
    question: (hi && spec.question_hi) || spec.question,
    options: (hi && spec.options_hi) || spec.options,
    allow_multiple: spec.allow_multiple,
  };
}

// Two option sets that overlap heavily are the same question re-skinned,
// even when the question TEXT was rewritten enough to defeat
// questionsLookRepeated() and the model self-labelled a different
// target_field. Compares normalized option strings; "Constant throughout the
// day" vs "Constant all day" won't match exactly, so a majority-overlap
// threshold on the smaller set is used rather than requiring identity.
function optionSetsLookRepeated(a, b) {
  // Filler words that carry no meaning inside a short option label, so
  // "worse in the evening" and "worse by evening" reduce to the same tokens.
  const FILLER = new Set(['in', 'the', 'by', 'a', 'an', 'of', 'at', 'to', 'is', 'it', 'and', 'or', 'my', 'me', 'i']);
  const tokens = (o) => String(o)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));

  const A = (Array.isArray(a) ? a : []).map(tokens).filter((t) => t.length > 0);
  const B = (Array.isArray(b) ? b : []).map(tokens).filter((t) => t.length > 0);
  if (A.length < 2 || B.length < 2) return false;

  // Two individual options are "the same option" when their content words
  // mostly coincide — exact string equality is too brittle, since the model
  // re-words chips every turn ("Constant all day" vs "Constant throughout
  // the day").
  const sameOption = (x, y) => {
    const setY = new Set(y);
    let shared = 0;
    for (const w of new Set(x)) if (setY.has(w)) shared += 1;
    return shared > 0 && shared / Math.min(new Set(x).size, setY.size) >= 0.6;
  };

  let matched = 0;
  for (const optA of A) if (B.some((optB) => sameOption(optA, optB))) matched += 1;
  return matched / Math.min(A.length, B.length) >= 0.6;
}

// Normalizes whatever the model put in "target_field" to a bare leaf field
// name — it may send a full path ("hpi.onset",
// "ayurveda_profile.prakriti.body_frame") or just the leaf ("onset").
function leafFieldName(targetField) {
  if (typeof targetField !== 'string' || !targetField.trim()) return null;
  const parts = targetField.trim().split('.');
  return parts[parts.length - 1] || null;
}

// The next genuinely-unanswered field in `section`, with a ready-to-send
// question + options for it. Used by the dedup guard to SUBSTITUTE a real
// question when the model tries to re-ask something already answered —
// picking deterministically here (rather than making a second AI call to
// ask it again) keeps the turn fast, which matters because intake-dialogue
// turns are already latency-sensitive (see aiClient.js's timeout note).
// Returns null when the section has nothing left to ask, in which case the
// caller leaves the model's own output alone and lets the normal
// section-completion checks advance the flow.
// Question + options spec for ONE named field, or null if that field isn't
// one this section knows how to ask about. Used when backfilling missing
// options onto a question the model DID ask legitimately — keying off the
// field it actually asked about, rather than "whatever's unanswered first",
// so the options can't end up describing a different question than the one
// on screen.
function questionSpecForField(field, history, intakeMethod, language = 'hi-IN') {
  if (!field) return null;
  const complaint = (history?.chief_complaint || 'problem').trim() || 'problem';

  if (HPI_FALLBACK_QUESTIONS[field]) {
    const spec = localizeSpec(HPI_FALLBACK_QUESTIONS[field], language);
    return {
      field,
      question: spec.question.replace(/\{complaint\}/g, complaint),
      options: spec.options,
      allow_multiple: spec.allow_multiple,
    };
  }
  if (DRUG_ALLERGY_FALLBACK_QUESTIONS[field]) {
    const spec = localizeSpec(DRUG_ALLERGY_FALLBACK_QUESTIONS[field], language);
    return { field, question: spec.question, options: spec.options, allow_multiple: spec.allow_multiple };
  }
  if (intakeMethod === 'ayurvedic') {
    const match = AYURVEDA_QUESTION_INDEX.find((q) => q.field === field);
    if (match) {
      const full = AYURVEDA_SUBSECTIONS.flatMap((s) => s.fields).find((f) => f.field === field);
      return {
        field,
        question: match.question,
        options: Array.isArray(full?.options) ? full.options : [],
        allow_multiple: !!full?.allowMultiple,
      };
    }
  }
  return null;
}

function nextUnansweredQuestionFor(section, history, intakeMethod, language = 'hi-IN') {
  const complaint = (history?.chief_complaint || 'problem').trim() || 'problem';
  const fill = (q) => q.replace(/\{complaint\}/g, complaint);

  if (section === 'hpi') {
    const field = HPI_FIELDS.find((f) => {
      const v = history?.hpi?.[f];
      if (f === 'associated_symptoms') return !Array.isArray(v) || v.length === 0;
      if (f === 'severity') return v === null || v === undefined || v === '';
      return !(typeof v === 'string' && v.trim() !== '');
    });
    const spec = field && localizeSpec(HPI_FALLBACK_QUESTIONS[field], language);
    if (!spec) return null;
    return { field, question: fill(spec.question), options: spec.options, allow_multiple: spec.allow_multiple };
  }

  if (section === 'drug_allergy') {
    const field = ['current_medications', 'allergies'].find(
      (f) => !(Array.isArray(history?.drug_allergy?.[f]) && history.drug_allergy[f].length > 0)
    );
    const spec = field && localizeSpec(DRUG_ALLERGY_FALLBACK_QUESTIONS[field], language);
    if (!spec) return null;
    return { field, question: spec.question, options: spec.options, allow_multiple: spec.allow_multiple };
  }

  if (section === 'ayurveda_profile' && intakeMethod === 'ayurvedic') {
    // Ayurveda has a real canonical question bank, so substitute the exact
    // question/options the patient would have been asked anyway.
    const profile = history?.ayurveda_profile || emptyAyurvedaProfile();
    const { fields } = nextAyurvedaFields(profile);
    const spec = fields?.[0];
    if (!spec) return null;
    return {
      field: spec.field,
      question: spec.question,
      options: Array.isArray(spec.options) ? spec.options : [],
      allow_multiple: !!spec.allowMultiple,
    };
  }

  return null;
}

// Every field already answered anywhere in this session, as flat
// "section.field" keys — fed into the prompt as an explicit
// "never ask these again" list and used by the dedup guard below.
// Deliberately spans ALL sections, not just the current one: a field can
// legitimately be filled from an earlier section (e.g. the patient
// volunteers duration inside their chief_complaint answer, which
// chief_complaint's rule captures straight into hpi.onset), and re-asking
// it later in hpi is exactly the duplicate this is meant to stop.
function capturedFieldKeys(history, intakeMethod) {
  const keys = [];
  if (typeof history?.chief_complaint === 'string' && history.chief_complaint.trim()) {
    keys.push('chief_complaint');
  }
  for (const f of HPI_FIELDS) {
    const v = history?.hpi?.[f];
    const filled = f === 'associated_symptoms'
      ? Array.isArray(v) && v.length > 0
      : f === 'severity'
        ? v !== null && v !== undefined && v !== ''
        : typeof v === 'string' && v.trim() !== '';
    if (filled) keys.push(`hpi.${f}`);
  }
  if (intakeMethod === 'ayurvedic' && history?.ayurveda_profile) {
    for (const field of AYURVEDA_LEAF_FIELDS) {
      if (isAyurvedaFieldAnswered(field, history.ayurveda_profile)) {
        const group = AYURVEDA_FIELD_GROUPS[field];
        keys.push(group ? `ayurveda_profile.${group}.${field}` : `ayurveda_profile.${field}`);
      }
    }
  }
  for (const f of ['current_medications', 'allergies']) {
    if (Array.isArray(history?.drug_allergy?.[f]) && history.drug_allergy[f].length > 0) {
      keys.push(`drug_allergy.${f}`);
    }
  }
  return keys;
}

// Every leaf field ayurveda_profile must have an answer (or explicit
// null/skip) for before that section can complete — derived from the
// question-set data so it can't drift out of sync with intakeQuestions.js.
const AYURVEDA_LEAF_FIELDS = Object.keys(AYURVEDA_FIELD_GROUPS);

const SECTIONS_ALLOPATHIC = ['chief_complaint', 'hpi', 'drug_allergy', 'finalize'];
const SECTIONS_AYURVEDIC = ['chief_complaint', 'hpi', 'ayurveda_profile', 'drug_allergy', 'finalize'];

function sectionsFor(intakeMethod) {
  return intakeMethod === 'ayurvedic' ? SECTIONS_AYURVEDIC : SECTIONS_ALLOPATHIC;
}

// Strips ```json fences etc. that free-tier chat models routinely wrap
// around JSON output despite being asked not to (same defensive parsing as
// searchService.js / labInsightsService.js).
function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model output');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function emptyAyurvedaProfile() {
  // Mirrors PRD §4.4's exact shape — skipped fields stay explicit null
  // (never omitted), same convention as the rest of structured_history.
  return {
    prakriti: { body_frame: null, skin_type: null, appetite_pattern: null, temperament: [], sleep_tendency: null },
    agni_ahara: { digestion_strength: null, bowel_pattern: null, thirst_level: null, taste_cravings: [], food_intolerances: null },
    nidra_dinacharya: { sleep_hours: null, sleep_quality: null, wake_routine: null, activity_level: null, work_stress_pattern: null },
    manas: { current_mood: [], recent_stressors: null },
    vikruti_qualities: [],
    history_ayurvedic: { prior_treatments: null, home_remedies: null },
  };
}

function emptyStructuredHistory(intakeMethod) {
  const base = {
    // Tracked INSIDE the jsonb blob (not a separate column) so
    // structured_history stays the single source of truth for state-machine
    // position, per PRD §7 ("no further normalization while the question
    // set is still moving"). Needed because deriving section purely from
    // field contents is ambiguous — e.g. an empty drug_allergy.allergies
    // array legitimately means "patient said none", not "not asked yet".
    // Confirmed with the user.
    section: 'chief_complaint',
    chief_complaint: '',
    hpi: {
      site: '',
      onset: '',
      character: '',
      radiation: '',
      associated_symptoms: [],
      timing: '',
      exacerbating_relieving: '',
      severity: null,
    },
    drug_allergy: {
      current_medications: [],
      allergies: [],
      notes: '',
    },
    red_flag: false,
    red_flag_reason: null,
  };
  if (intakeMethod === 'ayurvedic') {
    base.ayurveda_profile = emptyAyurvedaProfile();
  }
  return base;
}

function hpiComplete(hpi) {
  if (!hpi) return false;
  return HPI_FIELDS.every((f) => {
    const v = hpi[f];
    if (f === 'associated_symptoms') return Array.isArray(v); // may legitimately be empty
    if (f === 'severity') return v !== null && v !== undefined && v !== '';
    return typeof v === 'string' && v.trim() !== '';
  });
}

// Same belt-and-braces role as hpiComplete()/ayurvedaComplete() below —
// current_medications and allergies both being asked-and-answered (even
// with an explicit "none") IS the completion criterion for this section;
// notes is free text and not required. Added because drug_allergy had no
// deterministic check at all before, letting the model's own
// section_complete (often unreliable — see runIntakeTurn's repeat-guard
// comment) loop the same question turn after turn.
function drugAllergyComplete(drugAllergy) {
  if (!drugAllergy) return false;
  return Array.isArray(drugAllergy.current_medications) && drugAllergy.current_medications.length > 0
    && Array.isArray(drugAllergy.allergies) && drugAllergy.allergies.length > 0;
}

// Mirrors hpiComplete()'s pattern exactly: deterministic, field-by-field
// verification that every ayurveda_profile leaf has been asked about,
// independent of whatever the model itself reports for section_complete
// (Treatment-Method-Aware Intake PRD §4.1: "gated by a new ayurvedaComplete()
// deterministic check mirroring the existing hpiComplete() pattern").
// Array fields (temperament/taste_cravings/current_mood/vikruti_qualities)
// count as answered once they're an array, even empty — same treatment as
// hpi.associated_symptoms. Free-text skippable fields (food_intolerances/
// recent_stressors/home_remedies) count as answered once explicitly set,
// including explicitly-skipped (empty string counts, since the model is
// instructed to record an explicit "skip" rather than leave it untouched —
// see buildAyurvedaSectionRules below) as long as it's not still the
// initial null.
function ayurvedaComplete(profile) {
  if (!profile) return false;
  return AYURVEDA_LEAF_FIELDS.every((field) => isAyurvedaFieldAnswered(field, profile));
}

function isAyurvedaFieldAnswered(field, profile) {
  const group = AYURVEDA_FIELD_GROUPS[field];
  const v = group ? profile?.[group]?.[field] : profile?.[field];
  if (AYURVEDA_ARRAY_FIELDS.has(field)) return Array.isArray(v);
  if (AYURVEDA_SKIPPABLE_FIELDS.has(field)) return v !== null && v !== undefined;
  return typeof v === 'string' && v.trim() !== '';
}

// First not-yet-answered ayurveda sub-section, in PRD §4.5 order — drives
// "one sub-section per turn, 2-3 fields bundled" delivery. A sub-section
// counts as answered once every one of its fields passes the same
// per-field check ayurvedaComplete() uses.
function nextAyurvedaSubsection(profile) {
  for (const sub of AYURVEDA_SUBSECTIONS) {
    const allAnswered = sub.fields.every(({ field }) => isAyurvedaFieldAnswered(field, profile));
    if (!allAnswered) return sub;
  }
  return null;
}

// Handing a small free-tier model an entire 2-5 field sub-section and
// trusting it to (a) bundle them together, (b) ask them in order, and (c)
// never backtrack to an earlier sub-section turned out unreliable in
// testing (observed: it asked one field at a time, jumped ahead to a later
// sub-section's field, then came back). So instead of describing the whole
// sub-section, this picks the field list down to just the next 1-2
// still-unanswered fields IN FIXED ORDER (fields before the sub-section's
// own answered-in-full point never resurface), which is what actually gets
// exposed to the model — far less room for it to drift.
const FIELDS_PER_TURN = 2;

function nextAyurvedaFields(profile) {
  const sub = nextAyurvedaSubsection(profile);
  if (!sub) return { sub: null, fields: [] };
  const unanswered = sub.fields.filter(({ field }) => !isAyurvedaFieldAnswered(field, profile));
  return { sub, fields: unanswered.slice(0, FIELDS_PER_TURN) };
}

function buildAyurvedaSectionRules(structuredHistory) {
  const profile = structuredHistory.ayurveda_profile || emptyAyurvedaProfile();
  const { sub, fields } = nextAyurvedaFields(profile);

  if (!sub) {
    // Every sub-section already answered — nothing left to ask; the caller's
    // deterministic ayurvedaComplete() check will confirm and advance.
    return `- "ayurveda_profile": every field has been captured. Set section_complete: true and move on — do not ask anything further in this section.`;
  }

  const fieldLines = fields
    .map(({ field, question, options, allowMultiple, freeText, skippable, freeTextFollowUp }) => {
      const optionNote = freeText
        ? `free text${skippable ? ', explicitly skippable — if the patient has nothing to add, record it as skipped rather than leaving it unanswered' : ''}`
        : `options: ${JSON.stringify(options)}${allowMultiple ? ' (patient may pick MORE THAN ONE — set quick_reply_options.allow_multiple: true for this question)' : ''}${freeTextFollowUp ? ' — if they pick "Tried in the past", ask a brief free-text follow-up for what they tried' : ''}`;
      return `  - ${field}: "${question}" — ${optionNote}`;
    })
    .join('\n');

  return `- "ayurveda_profile": this is the Ayurvedic constitutional/lifestyle intake (Prakriti -> Agni & Ahara -> Nidra & Dinacharya -> Manas -> Vikruti -> History), asked in this exact fixed order, ${FIELDS_PER_TURN} field(s) at a time. You are currently on the "${sub.title}" sub-section. Ask ONLY the following field(s) this turn, in ONE natural bundled question — NOT any other field from this or any other sub-section, even ones you can see later in the flow:
${fieldLines}
Do not skip ahead to a later field or sub-section, and do not go back to one already answered in the structured history above. Once these specific field(s) are answered (or explicitly skipped, for the free-text ones marked skippable), the caller will hand you the next field(s) in order on the following turn — do NOT set section_complete: true until every ayurveda_profile field across all sub-sections is done. Since there ARE still fields left after this one (the ones listed above), your next_question this turn must NOT contain any closing/wrap-up phrase like "that completes...", "that's everything...", or "last question" — say that ONLY on the turn where section_complete actually becomes true.`;
}

// Scaffolding words that recur across MANY distinct intake questions
// ("How's your X generally?", "How would you describe your usual Y?") —
// excluded from the repetition check below so two genuinely different
// questions that happen to share the same sentence frame (e.g. "How's
// your digestion generally?" vs "How's your thirst?") don't falsely match
// on structural words alone. Kept intentionally small and hand-picked from
// the actual question sets in intakeQuestions.js + the HPI rules above,
// rather than a generic stopword list, so it doesn't also swallow the
// clinically-meaningful words those questions differ by.
const QUESTION_STOPWORDS = new Set([
  'how', 'your', 'you', 'the', 'and', 'did', 'this', 'would', 'describe',
  'usual', 'generally', 'like', 'mention', 'any', 'for', 'been', 'have',
  'has', 'recently', 'going', 'tried', 'feeling', 'lately', 'best', 'which',
  'these', 'else', 'also', 'anything', 'else?',
]);

// Normalizes text for a cheap repetition check — lowercases, strips
// punctuation, collapses whitespace, drops QUESTION_STOPWORDS. Used only to
// catch the model re-asking a question it already asked earlier in the
// section (observed in testing on the free-tier ladder: it sometimes fails
// to extract the patient's answer into updated_fields and instead loops an
// earlier field, either reworded — "When did this start?" -> "When did it
// start exactly, and how did it begin?" — or verbatim after asking
// something else in between).
function contentWords(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2 && !QUESTION_STOPWORDS.has(w));
}

// Word-overlap similarity (Jaccard over content-word sets, stopwords
// excluded) — good enough to catch "same question, different words"
// without pulling in an embedding call for every turn. Requires BOTH a
// high overlap ratio AND at least 2 shared content words, since two short
// questions can otherwise hit a high ratio off a single shared word (e.g.
// "usual appetite" vs "usual sleep" sharing only "usual", which the
// stopword filter already removes, but this is a second line of defense
// for any pair that slips through).
function questionsLookRepeated(a, b) {
  const wordsA = new Set(contentWords(a));
  const wordsB = new Set(contentWords(b));
  if (wordsA.size === 0 || wordsB.size === 0) return false;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared += 1;
  const overlap = shared / Math.min(wordsA.size, wordsB.size);
  return overlap >= 0.65 && shared >= 2;
}

// Flat list of every {field, question, group} the ayurveda question set
// defines, built once — used by the deterministic repeat-guard below to
// figure out which field a repeated lastQuestion was actually about,
// without assuming the model asked sub-section fields in the documented
// order (observed in testing: it doesn't always).
const AYURVEDA_QUESTION_INDEX = AYURVEDA_SUBSECTIONS.flatMap((sub) =>
  sub.fields.map(({ field, question, freeText, skippable }) => ({
    field,
    question,
    group: AYURVEDA_FIELD_GROUPS[field] || null,
    freeText: !!freeText,
    skippable: !!skippable,
  }))
);

// Patient-facing language for the generated question text (Voice Layer
// PRD §6). Chosen once at /intake/start and stored on the session row —
// this is the same value ttsService uses to pick a voice, threaded through
// to the GENERATION prompt so the question text itself is written in the
// patient's language rather than being English prose spoken by a Hindi
// voice (which was both unreadable for the patient and the source of
// mispronounced TTS, since Bulbul was being handed English text under a
// hi-IN language code).
const LANGUAGE_NAMES = {
  'hi-IN': 'Hindi (Devanagari script)',
  'en-IN': 'Indian English',
};

function buildSystemPrompt(section, structuredHistory, intakeMethod, lastQuestion, language) {
  const isAyurvedic = intakeMethod === 'ayurvedic';
  const languageName = LANGUAGE_NAMES[language] || LANGUAGE_NAMES['hi-IN'];
  const capturedKeys = capturedFieldKeys(structuredHistory, intakeMethod);
  const flowDescription = isAyurvedic
    ? 'chief_complaint -> hpi (SOCRATES-style follow-ups) -> ayurveda_profile (Ayurvedic constitution & lifestyle) -> drug_allergy -> finalize'
    : 'chief_complaint -> hpi (SOCRATES-style follow-ups) -> drug_allergy -> finalize';

  // Keyed by section name so buildSystemPrompt injects ONLY the current
  // section's rule below — a real bug this fixes (observed in testing):
  // every section's rule used to be concatenated into ONE "Section rules"
  // block regardless of Current section, including the full Ayurveda
  // sub-section field list (buildAyurvedaSectionRules always computes "next
  // unanswered field(s)" from an otherwise-empty profile early in a
  // session, so it's always concrete and example-rich). On a free-tier
  // model this reliably won out over the more abstract hpi instruction, so
  // right after chief_complaint the very first hpi turn skipped straight to
  // asking Prakriti questions ("How is your natural body frame?") instead
  // of anything about the patient's actual complaint — chief_complaint ->
  // hpi -> ayurveda_profile collapsed into chief_complaint -> ayurveda_
  // profile with hpi never actually asked. Only ever exposing the one rule
  // that matches Current section removes the ambiguity outright rather
  // than trying to word around it.
  const sectionRuleFor = {
    chief_complaint: `- "chief_complaint": ask the patient to state their main complaint if not yet captured. One short question. Once they answer, extract chief_complaint (a short clinical phrase for what's wrong) AND, only if the patient actually volunteered them in this same message, also capture duration into hpi.onset and any aggravating/relieving factor into hpi.exacerbating_relieving — never ask separate follow-up questions for those here, only capture what they already said unprompted (this avoids re-asking the same thing again once "hpi" starts). Once chief_complaint is captured, move to "hpi".`,
    hpi: `- "hpi": ask SOCRATES-style follow-ups (Site, Onset, Character, Radiation, Associated symptoms, Timing, Exacerbating/relieving factors, Severity) ONE OR TWO AT A TIME — never ask all 8 in one question. Only ask about fields still empty in hpi above (skip any already filled from chief_complaint's extraction). Only ask what's clinically relevant to THIS chief_complaint — do not ask a generic fixed checklist. Tailor which fields you probe and how to the complaint type, for example: pain/ache complaints -> site, character, radiation, severity, aggravating/relieving factors; headache -> location, duration, severity, triggers, vision changes, nausea/vomiting; cough -> duration, dry vs productive, fever, breathing difficulty, blood in sputum; skin complaints -> location, itching, duration, rash appearance, triggers; joint complaints -> which joint(s), duration, swelling, stiffness, pain on movement. Always also check associated_symptoms relevant to that complaint type (e.g. vomiting/fever/loose motion/constipation/bloating/loss of appetite for abdominal complaints). Phrase each question short and direct, clinical-questionnaire style (e.g. "How is your pain normally?" / "How would you describe X?"), NOT a long or casual sentence with asides. Offer more than a minimal set of short quick_reply_options where a patient would naturally pick from a small set (more than 2 closed options where the option set supports it — e.g. severity 1-10 buttons, or 3+ options for a symptom quality rather than a bare yes/no where richer options make sense), each option a single short phrase (one attribute, not several stacked together). When every hpi field is filled, set section_complete: true for this turn and the caller will advance to "${isAyurvedic ? 'ayurveda_profile' : 'drug_allergy'}". This section is ONLY about the patient's chief complaint — never ask about their general constitution, lifestyle, diet, sleep, or temperament here, even if this is an Ayurvedic session; that comes later in "ayurveda_profile". If the complaint is generalized rather than localized (fatigue, fever, dizziness, nausea, weakness, poor sleep, low mood), do NOT ask about site or radiation — "where exactly is the fatigue?" and "does the tiredness spread?" are meaningless to a patient; those two fields are pre-marked not-applicable for such complaints and appear in the ALREADY ANSWERED list above. On the turn where every hpi field finally becomes filled and you set section_complete: true, your next_question must go STRAIGHT into asking the first thing the next section needs — never a wrap-up line asking the patient's permission to continue, and never announcing or previewing what the next section is about (e.g. never "Now let's talk about your general health and lifestyle — is that okay?" or "Next I'll ask a few Ayurvedic questions about your constitution"). The patient never chose their doctor's treatment method and is not being offered a choice about what gets asked next — treat moving into the next section exactly like turning a page, with no announcement, the same way you would move from hpi into drug_allergy on a non-Ayurvedic session.`,
    ayurveda_profile: isAyurvedic ? buildAyurvedaSectionRules(structuredHistory) : null,
    drug_allergy: `- "drug_allergy": ask about current medications and known drug/food allergies — TWO separate questions (medications first, then allergies), never bundled into one, and never ask either one more than once. When the patient answers "none"/"no" to either, still write a non-empty array for it — e.g. current_medications: ["None"] or allergies: ["None"] — NEVER leave it as an empty array or omit it, since an empty array cannot be distinguished from "not asked yet". Once BOTH current_medications and allergies are each a non-empty array, set section_complete: true.`,
    finalize: `- "finalize": no more questions — the session is being closed. Return next_question as a short closing message (e.g. "Thanks, that's everything the doctor needs — please have a seat.") and quick_reply_options as { "options": [], "allow_multiple": false }.`,
  };
  const sectionRules = [sectionRuleFor[section] || `- "${section}": (no rule defined — advance or ask a safe generic follow-up)`];

  return `You are a clinical intake assistant for an Indian OPD (outpatient) clinic. You are talking directly to a PATIENT before their doctor consult, gathering a structured history. You NEVER diagnose, suggest a condition, or give medical advice — you only ask focused follow-up questions and structure what the patient tells you. This applies identically whether the consulting doctor practices allopathic or Ayurvedic medicine — do not suggest a diagnosis, condition, dosha imbalance conclusion, or treatment in either case.

LANGUAGE — read this before anything else:
Write EVERY patient-facing string in ${languageName}. That means "next_question" (including the "finalize" closing message) and every string inside "quick_reply_options.options" — those are shown to the patient and read aloud to them, so a patient who only reads ${languageName} must be able to understand them completely.
Keep widely-recognised clinical terms and medicine names as-is where a patient would actually recognise them better that way (e.g. "fever", "BP", "sugar", brand names) rather than forcing an unnatural literal translation — natural clinic speech, not textbook translation.
EXCEPTION — "updated_fields" is NOT patient-facing: every value you write inside "updated_fields" must stay in ENGLISH, exactly as before, because it becomes the doctor's clinical record. So you may ask the patient a question in ${languageName} and record their answer in English in the same turn. JSON keys/field names are ALWAYS English and never translated.

ONE QUESTION PER TURN — this is a hard rule:
"next_question" must ask about EXACTLY ONE thing. Never bundle two different fields into one turn, whether joined by "and", "aur", "और", a comma, or a second question mark. Ask one field, wait for the patient's answer, then ask the next field on the FOLLOWING turn. A patient answering aloud can only answer one thing at a time, and a bundled question reliably gets only half an answer — which then gets recorded against the wrong field.
BAD  (two fields — site AND onset bundled): "यह दर्द पेट के किस हिस्से में है और कब से हो रहा है?"
GOOD (site only, this turn):                "यह दर्द पेट के किस हिस्से में है?"
GOOD (onset only, the NEXT turn):           "यह दर्द कब से हो रहा है?"
Offering several quick_reply_options for that ONE question is correct and encouraged — a list of choices for a single field is not the same thing as asking two questions.
This does not forbid a single clinically-standard pair inside ONE field (e.g. "क्या उल्टी या मितली हो रही है?" is one associated_symptoms question, not two) — the test is whether you are filling one field or two.

Current section: "${section}"
Section flow: ${flowDescription}.
${isAyurvedic ? 'This patient\'s doctor practices Ayurvedic medicine — the flow includes an extra "ayurveda_profile" section (constitutional/lifestyle detail their approach depends on) after "hpi", which you will be told to focus on once the current section reaches it. Never ask the patient which kind of doctor they are seeing or which question set to use — that is already decided.' : ''}
${lastQuestion ? `\nThe question you JUST asked the patient (their "Patient's latest message" below is a direct answer to THIS): "${lastQuestion}"\n` : ''}
Structured history so far (jsonb, do not remove existing fields, only add/update):
${JSON.stringify(structuredHistory, null, 2)}

ALREADY ANSWERED — never ask about any of these again, in any wording, for the rest of this session:
${capturedKeys.length > 0 ? capturedKeys.map((k) => `- ${k}`).join('\n') : '- (nothing captured yet)'}
A field on this list is DONE. It does not matter that you have not personally asked about it this turn, or that the patient answered it as part of a different question, or that you could word it differently — if the key is listed above, asking about it again is a duplicate and is forbidden. Pick a field that is NOT on this list.

Section rules:
${sectionRules.join('\n')}

ONE FIELD PER TURN (strict): "next_question" must ask about EXACTLY ONE field — never two. Do not join two different fields with "and", and do not ask a second thing in a follow-on sentence. If you were about to ask about two fields, ask ONLY the first one this turn; you will get another turn for the second one after the patient answers.
  WRONG (asks onset AND exacerbating_relieving in one message): "Could you tell me how long you've been experiencing hairfall, and if there are any specific factors that make it better or worse?"
  RIGHT (onset only, its own turn): "How long have you been experiencing hairfall?"
  RIGHT (exacerbating_relieving, on a LATER turn): "Does anything make the hairfall better or worse?"
Splitting into two option-groups in one message does NOT satisfy this rule — it must be two separate turns.

CRITICAL — extracting the answer (this is the #1 failure mode to avoid): the patient's latest message is their answer to the question you just asked above. You MUST parse whatever they said — including short, casual, or indirect phrasing ("a week ago", "over the last few days", "comes and goes"), typos, and single-word free-text answers — into the matching field(s) in "updated_fields" this same turn. Never re-ask the same field again just because their wording wasn't a clean match to your options; interpret it and move on. This applies EQUALLY to free-text fields (e.g. food_intolerances, recent_stressors, home_remedies) — a short or oddly-spelled reply to a free-text question is still a real answer, record it as-is.
For a multi-select question (associated_symptoms, or any ayurveda_profile field marked "patient may pick MORE THAN ONE"), the patient's message may be a comma-separated MIX of a tapped option and something they additionally typed — e.g. "Fever, tiredness" means they both picked the "Fever" chip AND typed "tiredness" as an extra symptom. Both parts are real answers: split on commas and capture EVERY distinct item into the array, not just the first or the last one. Do not discard a part because it doesn't exactly match one of the options you offered — an extra typed item is still valid content for that field.
Do NOT output a next_question that repeats — verbatim or reworded — ANY question you have already asked earlier in this same section, even one from several turns back. Keep track of every field you've already asked about in this section (see structured history above) and always move to a genuinely different still-empty one, or advance the section, once the patient has answered.

Red-flag check (run this on EVERY turn regardless of section, independent of section progress):
The following symptom patterns are red flags that must be surfaced immediately:
${RED_FLAG_TRIGGERS.map((t) => `- ${t}`).join('\n')}
If the patient's most recent message or anything already in structured_history matches one of these, set red_flag: true and red_flag_reason to a short clinical phrase naming which pattern matched (e.g. "Chest pain with radiation to left arm"). Once true, red_flag stays true for the rest of the session even if a later turn doesn't re-mention it — never flip it back to false.

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "next_question": "<the next question or closing message to show the patient>",
  "target_field": "<the ONE field key next_question is asking about, e.g. \\"hpi.onset\\", \\"drug_allergy.allergies\\"${isAyurvedic ? ', \\"ayurveda_profile.prakriti.body_frame\\"' : ''}, or null on the finalize turn>",
  "quick_reply_options": { "options": ["<short tappable option>", "..."], "allow_multiple": <true if the patient may pick more than one option this turn, else false> },
  "updated_fields": {
    "chief_complaint": "<string, only if this turn updated it, else omit>",
    "hpi": { "<only the hpi fields this turn updated>": "<value>" },
    ${isAyurvedic ? '"ayurveda_profile": { "<sub-object name, e.g. prakriti>": { "<only the fields this turn updated>": "<value or array>" }, "vikruti_qualities": ["<only if this turn updated it>"] },\n    ' : ''}"drug_allergy": { "<only the drug_allergy fields this turn updated>": "<value>" }
  },
  "section_complete": <true if the CURRENT section ("${section}") is now fully captured, else false>,
  "red_flag": <true|false>,
  "red_flag_reason": "<short reason if red_flag is true, else null>"
}

Rules for the JSON:
- "quick_reply_options.options" is REQUIRED and must NEVER be empty on any question turn (the only exception is the "finalize" closing message, which uses []). Always generate 3-5 short, tappable options, written fresh for THIS patient's specific complaint and THIS field — not generic filler, and not copied from some other complaint. Hairfall options must be about hairfall, headache options about headache, joint pain about joint pain.
- This applies even to fields that feel inherently open-ended. There is always a sensible small answer set — generate it. e.g. radiation -> ["No, stays in one place", "Yes, spreads nearby", "Not sure"]; a free-text field like recent_stressors -> ["Work", "Family", "Health", "Nothing in particular"]. Never return a question with no options and expect the patient to type.
- Options do NOT need to cover every possibility: the patient always has a free-text box available alongside them, so 3-5 likely answers plus an escape option like "Other" / "Not sure" is the right shape. Keep each option a single short phrase.
- "quick_reply_options.allow_multiple" must be true whenever more than one answer can genuinely apply to the question just asked (e.g. multiple symptoms, multiple tastes, multiple moods) — false otherwise. Multi-select renders as checkboxes, single-select as tap-to-send chips.
- "target_field" must name the single field "next_question" is asking about, using the same key path as the structured history above. It must NOT be a field on the ALREADY ANSWERED list. If you genuinely cannot find an unanswered field left in this section, set section_complete: true instead of re-asking something.
- CRITICAL RULE for "updated_fields" — if a field has not actually been asked about and answered by the patient, OMIT it entirely. Do NOT guess, do NOT invent a plausible-sounding value, do NOT fill in what a typical patient with this complaint "probably" would have said, and do NOT estimate a value from the rest of the history. A blank field the doctor can ask about in person is far better than a confident-looking wrong answer on a clinical record — a fabricated severity or duration could change how a patient is triaged. Only record what the patient actually told you, in the turn they told you.
- Concretely: if you never asked about severity, "severity" must not appear in updated_fields at all. Never write a number there because 5 or 7 seems reasonable for this complaint. The same applies to every other field.
- "updated_fields" should ONLY contain fields the patient's latest message actually gave information for.
- Language split, restated because it is easy to get wrong: "next_question" and "quick_reply_options.options" are in ${languageName}; every value inside "updated_fields" is in English. The patient may answer in any language or script — always normalise what they said into English before writing it into "updated_fields".
- "severity" in hpi, if provided, must be an integer 1-10.
- Never include a diagnosis, condition name, dosha-imbalance conclusion, or treatment suggestion anywhere in your response.
- "next_question" must not contradict "section_complete": if section_complete is false, never phrase next_question as a wrap-up ("that completes...", "that's everything...", "last question...", "great, all done with X") right before still going on to ask something else in the SAME response — that reads as the assistant contradicting itself mid-message. Only use wrap-up phrasing on the turn where section_complete is actually true (or, within ayurveda_profile, only once every one of its sub-sections is done).`;
}

// Keywords that mark a question as having actually asked about a given HPI
// field, in both languages. Used by the invention guard below — NOT to
// parse answers, only to decide "was this field ever put to the patient?"
//
// Deliberately generous: a false positive here just permits a value the
// model wanted to write anyway (status quo), while a false negative
// silently drops a real answer the patient gave — which is strictly worse,
// because the field then stays empty and the engine re-asks it every turn,
// stranding the patient in a loop (observed in testing: a genuine
// "खाने के बाद बढ़ता है" answer was dropped because the cue list was too
// narrow, and that question then repeated three turns running).
// So this errs hard toward allowing, and only blocks fields with no
// plausible question behind them at all — the observed invention case was
// severity appearing with no severity question anywhere in the transcript.
const HPI_FIELD_CUES = {
  site: ['where', 'which part', 'location', 'कहाँ', 'कहां', 'किस हिस्से', 'जगह'],
  onset: ['when did', 'since when', 'how long', 'start', 'began', 'कब से', 'कब शुरू', 'कितने दिन', 'कब'],
  character: ['what kind', 'describe', 'feel like', 'type of pain', 'कैसा', 'किस तरह', 'कैसी'],
  radiation: ['spread', 'travel', 'move to', 'radiat', 'फैल', 'जाता', 'कहीं और'],
  associated_symptoms: ['along with', 'other symptom', 'also have', 'nausea', 'vomit', 'fever', 'साथ', 'अन्य लक्षण', 'उल्टी', 'मितली', 'बुखार', 'दस्त'],
  timing: ['come and go', 'constant', 'all the time', 'time of day', 'intermittent', 'लगातार', 'रुक', 'कभी', 'समय'],
  exacerbating_relieving: ['better', 'worse', 'relief', 'trigger', 'after eating', 'make it', 'बढ़', 'कम', 'आराम', 'खाने के बाद', 'ज़्यादा', 'ज्यादा', 'चीज़', 'चीज', 'असर', 'फर्क', 'राहत'],
  severity: ['severity', 'how bad', 'how severe', 'scale', '1 to 10', '1-10', 'pain score', 'कितना', 'तीव्रता', 'गंभीर', 'दस में'],
};

/**
 * True if `field` was plausibly asked about in any assistant question this
 * session (or in the question being answered right now).
 */
function wasFieldAsked(field, askedQuestions) {
  const cues = HPI_FIELD_CUES[field];
  if (!cues) return true; // unknown field — not ours to police
  const haystack = askedQuestions.join(' \n ').toLowerCase();
  return cues.some((cue) => haystack.includes(cue.toLowerCase()));
}

/**
 * Drops HPI values the model tried to write for fields it never actually
 * asked about — the "Severity: 5 with no severity question anywhere in the
 * transcript" failure. Same principle the OCR extraction prompt states in
 * config/gemini.js: a blank field a clinician can ask about in person
 * beats a confident-looking invented one on a medical record.
 *
 * Only applies to NEW writes. A value already in structured_history from an
 * earlier turn is left alone — it was vetted when it was written.
 *
 * @returns {{ cleaned: object, dropped: string[] }}
 */
function stripUnaskedHpiFields(updatedFields, currentHpi, askedQuestions) {
  if (!updatedFields?.hpi || typeof updatedFields.hpi !== 'object') {
    return { cleaned: updatedFields, dropped: [] };
  }

  const dropped = [];
  const keptHpi = {};

  for (const [field, value] of Object.entries(updatedFields.hpi)) {
    // Already populated => this is a correction/refinement of an answer the
    // patient previously gave, not an invention. Let it through.
    const existing = currentHpi?.[field];
    const alreadyHasValue = Array.isArray(existing)
      ? existing.length > 0
      : existing !== '' && existing !== null && existing !== undefined;

    if (alreadyHasValue || wasFieldAsked(field, askedQuestions)) {
      keptHpi[field] = value;
    } else {
      dropped.push(field);
    }
  }

  if (dropped.length > 0) {
    console.warn(
      `[intake] dropped ${dropped.length} invented hpi field(s) never asked about: ${dropped.join(', ')}`
    );
  }

  return { cleaned: { ...updatedFields, hpi: keptHpi }, dropped };
}

function mergeStructuredHistory(current, updatedFields, intakeMethod) {
  const next = {
    ...current,
    section: current.section, // set by the caller after merging, via nextSection()
    hpi: { ...current.hpi },
    drug_allergy: { ...current.drug_allergy },
  };
  if (intakeMethod === 'ayurvedic') {
    const currentProfile = current.ayurveda_profile || emptyAyurvedaProfile();
    next.ayurveda_profile = {
      prakriti: { ...currentProfile.prakriti },
      agni_ahara: { ...currentProfile.agni_ahara },
      nidra_dinacharya: { ...currentProfile.nidra_dinacharya },
      manas: { ...currentProfile.manas },
      vikruti_qualities: Array.isArray(currentProfile.vikruti_qualities) ? [...currentProfile.vikruti_qualities] : [],
      history_ayurvedic: { ...currentProfile.history_ayurvedic },
    };
  }
  if (!updatedFields || typeof updatedFields !== 'object') return next;

  if (typeof updatedFields.chief_complaint === 'string' && updatedFields.chief_complaint.trim()) {
    next.chief_complaint = updatedFields.chief_complaint.trim();
  }
  if (updatedFields.hpi && typeof updatedFields.hpi === 'object') {
    for (const [k, v] of Object.entries(updatedFields.hpi)) {
      if (!HPI_FIELDS.includes(k)) continue;
      if (k === 'associated_symptoms') {
        next.hpi[k] = Array.isArray(v) ? v.map(String) : next.hpi[k];
      } else if (k === 'severity') {
        const n = Number(v);
        next.hpi[k] = Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : next.hpi[k];
      } else if (typeof v === 'string') {
        next.hpi[k] = v.trim();
      }
    }
  }
  if (intakeMethod === 'ayurvedic' && updatedFields.ayurveda_profile && typeof updatedFields.ayurveda_profile === 'object') {
    const src = updatedFields.ayurveda_profile;
    // vikruti_qualities is flat at the top level of ayurveda_profile.
    if (Array.isArray(src.vikruti_qualities)) {
      next.ayurveda_profile.vikruti_qualities = src.vikruti_qualities.map(String);
    }
    for (const groupKey of ['prakriti', 'agni_ahara', 'nidra_dinacharya', 'manas', 'history_ayurvedic']) {
      const groupSrc = src[groupKey];
      if (!groupSrc || typeof groupSrc !== 'object') continue;
      for (const [field, value] of Object.entries(groupSrc)) {
        if (AYURVEDA_FIELD_GROUPS[field] !== groupKey) continue; // only merge fields that actually belong to ayurveda_profile's known shape — never invent new keys
        if (AYURVEDA_ARRAY_FIELDS.has(field)) {
          next.ayurveda_profile[groupKey][field] = Array.isArray(value) ? value.map(String) : next.ayurveda_profile[groupKey][field];
        } else if (typeof value === 'string') {
          next.ayurveda_profile[groupKey][field] = value.trim();
        } else if (value === null && AYURVEDA_SKIPPABLE_FIELDS.has(field)) {
          // Explicit skip on a skippable free-text field — recorded as null,
          // same "asked but no value" convention as the rest of the schema.
          next.ayurveda_profile[groupKey][field] = null;
        }
      }
    }
  }
  if (updatedFields.drug_allergy && typeof updatedFields.drug_allergy === 'object') {
    const da = updatedFields.drug_allergy;
    if (Array.isArray(da.current_medications)) {
      next.drug_allergy.current_medications = da.current_medications.map(String);
    }
    if (Array.isArray(da.allergies)) {
      next.drug_allergy.allergies = da.allergies.map(String);
    }
    if (typeof da.notes === 'string') {
      next.drug_allergy.notes = da.notes.trim();
    }
  }
  return next;
}

function nextSection(current, sectionComplete, intakeMethod) {
  if (!sectionComplete) return current;
  const sections = sectionsFor(intakeMethod);
  const idx = sections.indexOf(current);
  if (idx === -1 || idx === sections.length - 1) return current;
  return sections[idx + 1];
}

// Shown when every provider in the ladder failed for this turn. aiClient's
// FRIENDLY_FALLBACK is English-only by design (shared transport layer, no
// session context), so intake supplies its own language-aware wording —
// the patient should never be dropped into English mid-session just
// because the model ladder was exhausted.
const EXHAUSTION_MESSAGE = {
  'en-IN': "Swastha couldn't process this right now. Please try again shortly.",
  'hi-IN': 'अभी कुछ तकनीकी दिक्कत आ रही है। कृपया थोड़ी देर बाद दोबारा कोशिश करें।',
};

function exhaustionMessageFor(language) {
  return EXHAUSTION_MESSAGE[language] || EXHAUSTION_MESSAGE['hi-IN'];
}

/**
 * Runs one dialogue-engine turn: builds the prompt from current
 * structured_history + section + intake_method, calls
 * runAI('intake-dialogue'), and returns the parsed/validated turn result
 * plus the merged structured_history and next section. Does NOT touch the
 * database — callers (routes) own reading/writing the intake_sessions row,
 * same boundary as searchService.js not owning `reports`.
 *
 * @param {{ section: string, structuredHistory: object, patientMessage: string, intakeMethod?: 'allopathic'|'ayurvedic', lastQuestion?: string, priorQuestionsInSection?: string[], priorOptionSetsInSection?: string[][] }} params
 *   lastQuestion is the assistant's own previous next_question (from
 *   session.turns) — passed back into the prompt so the model has explicit
 *   context on what the patient's message is answering.
 *   priorQuestionsInSection is every assistant question asked so far in the
 *   CURRENT section (including lastQuestion) — used below as a deterministic
 *   fallback if the model still fails to extract an answer into
 *   updated_fields and instead repeats an earlier question verbatim or
 *   reworded, even one from a few turns back (the model doesn't always ask
 *   fields in the documented order, so a repeat isn't always of the very
 *   last question).
 */
export async function runIntakeTurn({ section, structuredHistory, patientMessage, intakeMethod = 'allopathic', lastQuestion = null, priorQuestionsInSection = [], priorOptionSetsInSection = [], priorQaInSection = [], language = 'hi-IN' }) {
  const sections = sectionsFor(intakeMethod);
  if (!sections.includes(section)) {
    throw new Error(`runIntakeTurn: unknown section "${section}" for intake_method "${intakeMethod}"`);
  }
  const rawHistory = structuredHistory && typeof structuredHistory === 'object'
    ? structuredHistory
    : emptyStructuredHistory(intakeMethod);
  // Mark site/radiation N/A up front for systemic complaints, so the prompt
  // below lists them as ALREADY ANSWERED and the model never asks "where
  // exactly is the fatigue?".
  const history = markInapplicableHpiFields(rawHistory);

  const prompt = `${buildSystemPrompt(section, history, intakeMethod, lastQuestion, language)}\n\nPatient's latest message: "${(patientMessage || '').trim()}"`;

  const gen = await runAI({ task: 'intake-dialogue', input: prompt, json: true, label: 'intake-dialogue' });

  if (!gen.ok) {
    // Degrade the same way searchService/labInsights do: never throw a raw
    // 500 for a generation-class task. The session stays in_progress and the
    // patient sees the friendly fallback as the "question" — caller can
    // retry the same turn.
    //
    // aiClient's FRIENDLY_FALLBACK is English-only and lives in a shared
    // transport layer with no session context (and is byte-mirrored in
    // backend/services/aiClient.js, which must stay identical), so the
    // localized wording is chosen HERE, where the session's language is
    // known. Otherwise a Hindi session ends a turn in English.
    return {
      ok: false,
      next_question: exhaustionMessageFor(language),
      quick_reply_options: { options: [], allow_multiple: false },
      structured_history: history,
      section,
      section_complete: false,
      red_flag: !!history.red_flag,
      red_flag_reason: history.red_flag_reason || null,
      degraded: true,
      error_code: gen.error_code,
    };
  }

  let parsed;
  try {
    parsed = extractJson(gen.text);
  } catch (err) {
    // Same defensive posture as labInsightsService: a 200 with unparsable
    // JSON is a real failure, not a degraded-but-ok result — surface it so
    // the route can log/retry rather than silently corrupting state.
    throw new Error(`Intake dialogue model returned unparsable output: ${err.message}`);
  }

  // Cheap compound-question tripwire. Deliberately only counts question
  // marks rather than trying to detect conjunctions: "और"/"and" appears
  // constantly inside perfectly good single questions (option lists,
  // clinically-standard symptom pairs like "nausea and vomiting"), so
  // conjunction-matching would fire on correct questions. Two question
  // marks is unambiguous. Logged, never auto-retried — a retry would add
  // a full LLM round-trip to a turn that is usually fine, and the prompt
  // rule above is the actual fix.
  const questionMarks = (parsed.next_question?.match(/[?？]/g) || []).length;
  if (questionMarks > 1) {
    console.warn(`[intake] possible compound question (${questionMarks} "?"): ${parsed.next_question}`);
  }

  // red_flag is sticky — once true, never flips back to false even if the
  // model didn't re-detect it this turn (PRD §6.1: independent of section
  // progress, and a missed re-mention should never un-flag a session).
  const redFlag = !!history.red_flag || !!parsed.red_flag;
  const redFlagReason = history.red_flag ? history.red_flag_reason : (parsed.red_flag ? (parsed.red_flag_reason || 'Red flag detected') : null);

  // Invention guard: refuse to record an HPI field the patient was never
  // asked about (see stripUnaskedHpiFields). The questions considered are
  // every assistant question asked so far in this section PLUS the one
  // being answered right now — the patient's current message can only be
  // answering a question that has already been put to them.
  const askedQuestions = [...priorQuestionsInSection, lastQuestion].filter(Boolean);
  const { cleaned: vettedFields } = stripUnaskedHpiFields(
    parsed.updated_fields,
    history.hpi,
    askedQuestions
  );

  let mergedHistory = {
    ...mergeStructuredHistory(history, vettedFields, intakeMethod),
    red_flag: redFlag,
    red_flag_reason: redFlagReason,
  };

  // ── Direct extraction-miss guard ────────────────────────────────────
  // Everything below this point (the repeat-detection back-fill, and the
  // dedup guard further down) only rescues a missed answer AFTER the model
  // has gone on to re-ask the same field — which is why a field could be
  // asked three times in a row with two different real answers given
  // in between: turn 1's extraction silently failed, and nothing checked
  // that until the model happened to repeat itself on turn 2, whose
  // extraction ALSO silently failed, so nothing rescued turn 2's answer
  // either — it took a third ask before the pattern was even detectable.
  //
  // This closes that gap directly: every turn, verify that whatever
  // question was just asked (lastQuestion) actually got its field filled by
  // THIS turn's merge. If the field this message was answering is still
  // empty afterward, the model failed to extract it — write the patient's
  // raw message into it now, before any repeat can occur, rather than
  // waiting for one to happen and hoping the field-key or option-overlap
  // guards catch it later.
  if (lastQuestion && (patientMessage || '').trim()) {
    const answeredField = fieldForQuestion(section, lastQuestion, intakeMethod);
    if (answeredField) {
      const stillMissing = !capturedFieldKeys(mergedHistory, intakeMethod)
        .some((k) => leafFieldName(k) === answeredField);
      if (stillMissing) {
        const raw = patientMessage.trim();
        if (section === 'hpi' && HPI_FIELDS.includes(answeredField)
            && answeredField !== 'associated_symptoms' && answeredField !== 'severity') {
          mergedHistory = { ...mergedHistory, hpi: { ...mergedHistory.hpi, [answeredField]: raw } };
        } else if (section === 'drug_allergy' && (answeredField === 'allergies' || answeredField === 'current_medications')) {
          mergedHistory = { ...mergedHistory, drug_allergy: { ...mergedHistory.drug_allergy, [answeredField]: [raw] } };
        } else if (section === 'ayurveda_profile' && !AYURVEDA_ARRAY_FIELDS.has(answeredField)) {
          const profile = mergedHistory.ayurveda_profile || emptyAyurvedaProfile();
          const group = AYURVEDA_FIELD_GROUPS[answeredField];
          const nextProfile = { ...profile };
          if (group) nextProfile[group] = { ...profile[group], [answeredField]: raw };
          else nextProfile[answeredField] = raw;
          mergedHistory = { ...mergedHistory, ayurveda_profile: nextProfile };
        }
      }
    }
  }

  // Re-apply after the merge: the chief_complaint may only have become known
  // on THIS turn (the first turn starts with it empty), so this is the point
  // where a systemic complaint first becomes detectable and its N/A fields
  // must be persisted.
  mergedHistory = markInapplicableHpiFields(mergedHistory);

  // Deterministic repair for the #1 observed failure mode on the free-tier
  // model ladder: the model fails to extract the patient's answer into
  // updated_fields and instead re-asks a question it already asked earlier
  // in this same section — sometimes reworded (e.g. "When did this start?"
  // -> "When did it start exactly, and how did it begin?"), sometimes
  // verbatim after asking something else in between (observed in testing on
  // the Ayurvedic ladder: asked food_intolerances, patient answered, bot
  // asked digestion_strength instead, then came back and re-asked
  // food_intolerances verbatim — the earlier free-text answer was silently
  // dropped). Checked against every prior question in the section, not just
  // the immediately preceding one, since the model doesn't reliably ask in
  // the documented field order. Falls back to recording the patient's raw
  // message verbatim in whichever known field the repeated question maps to
  // (if it's still empty) rather than leaving it blank and looping forever
  // — an imperfect but honest capture the doctor can still read, beats a
  // stuck session.
  if ((patientMessage || '').trim() && typeof parsed.next_question === 'string' && priorQuestionsInSection.length > 0) {
    const repeatedQuestion = priorQuestionsInSection.find((q) => questionsLookRepeated(q, parsed.next_question));

    if (repeatedQuestion) {
      // Which field was the repeated question about? Inferred from its own
      // text, section-aware — never from the model's self-report, which is
      // unreliable.
      const repeatedField = fieldForQuestion(section, repeatedQuestion, intakeMethod);
      // And what did the patient ORIGINALLY answer it with? A repeat is
      // usually of an older question, so the current patientMessage is
      // typically the answer to some OTHER field — using it here is what
      // would file "None" (a medications answer) under allergies.
      const originalQa = priorQaInSection.find((qa) => questionsLookRepeated(qa.question, repeatedQuestion));
      const recovered = originalQa
        ? originalQa.answer
        // Only fall back to the current message when the repeat is of the
        // question we literally just asked, where they are the same thing.
        : (lastQuestion && questionsLookRepeated(lastQuestion, repeatedQuestion) ? patientMessage.trim() : null);

      if (repeatedField && recovered) {
        if (section === 'hpi' && HPI_FIELDS.includes(repeatedField)
            && repeatedField !== 'associated_symptoms' && repeatedField !== 'severity') {
          const empty = !(typeof mergedHistory.hpi?.[repeatedField] === 'string' && mergedHistory.hpi[repeatedField].trim() !== '');
          if (empty) {
            mergedHistory = { ...mergedHistory, hpi: { ...mergedHistory.hpi, [repeatedField]: recovered } };
          }
        } else if (section === 'drug_allergy' && (repeatedField === 'allergies' || repeatedField === 'current_medications')) {
          if (!(Array.isArray(mergedHistory.drug_allergy?.[repeatedField]) && mergedHistory.drug_allergy[repeatedField].length > 0)) {
            mergedHistory = {
              ...mergedHistory,
              drug_allergy: { ...mergedHistory.drug_allergy, [repeatedField]: [recovered] },
            };
          }
        } else if (section === 'ayurveda_profile' && !AYURVEDA_ARRAY_FIELDS.has(repeatedField)) {
          const profile = mergedHistory.ayurveda_profile || emptyAyurvedaProfile();
          const group = AYURVEDA_FIELD_GROUPS[repeatedField];
          const current = group ? profile[group]?.[repeatedField] : profile[repeatedField];
          if (!(typeof current === 'string' && current.trim() !== '')) {
            const nextProfile = { ...profile };
            if (group) nextProfile[group] = { ...profile[group], [repeatedField]: recovered };
            else nextProfile[repeatedField] = recovered;
            mergedHistory = { ...mergedHistory, ayurveda_profile: nextProfile };
          }
        }
      }
    }
  }

  // Section completion is trusted from the model turn-by-turn, but verified
  // deterministically where we can, rather than trusted blindly — belt-and-
  // braces against the model drifting on section_complete over a longer
  // conversation (PRD §10 JSON-reliability risk; observed in testing: the
  // model kept asking HPI-style follow-ups while still reporting
  // section_complete: false for "chief_complaint" even after
  // chief_complaint was clearly captured).
  let sectionComplete = !!parsed.section_complete;
  if (section === 'chief_complaint' && mergedHistory.chief_complaint?.trim()) {
    // A non-empty chief_complaint IS the completion criterion for this
    // section — force it forward regardless of what the model reported,
    // since staying stuck here would otherwise re-ask "what's your main
    // complaint" forever even as HPI answers come in.
    sectionComplete = true;
  }
  if (section === 'hpi' && sectionComplete && !hpiComplete(mergedHistory.hpi)) {
    sectionComplete = false;
  }
  if (section === 'ayurveda_profile') {
    // Deterministic double-check mirroring hpiComplete()'s role above
    // (Treatment-Method-Aware Intake PRD §4.1) — the model's own
    // section_complete is never trusted alone for advancing out of
    // ayurveda_profile.
    sectionComplete = ayurvedaComplete(mergedHistory.ayurveda_profile);
  }
  if (section === 'drug_allergy' && sectionComplete && !drugAllergyComplete(mergedHistory.drug_allergy)) {
    // Same belt-and-braces as hpi/ayurveda_profile above — this section had
    // no deterministic check at all before, and the model was observed
    // reporting section_complete: false turn after turn even once both
    // fields were captured (or genuinely dropping "None" on extraction),
    // looping "What medications are you currently taking?" indefinitely.
    sectionComplete = false;
  }

  const resolvedSection = nextSection(section, sectionComplete, intakeMethod);
  mergedHistory.section = resolvedSection;

  // Deterministic backstop for the same self-contradiction the prompt rule
  // above targets (observed in testing: "Thanks, that completes the
  // lifestyle and sleep questions." immediately followed by "How many
  // hours do you usually sleep?" in the same response) — if our own
  // (verified) sectionComplete says there's more to ask, strip any
  // leading wrap-up clause the model wrote anyway so the patient never
  // sees the two contradict each other, even if the prompt rule doesn't
  // land on a given turn.
  const nextQuestionText = typeof parsed.next_question === 'string' ? parsed.next_question.trim() : '';
  const cleanedNextQuestion = sectionComplete
    ? nextQuestionText
    : nextQuestionText.replace(
        /^(?:(?:great|thanks|thank you|ok(?:ay)?|got it|perfect)[,!.]?\s*)?(?:that\s+(?:completes|covers|wraps up)|that'?s\s+(?:everything|all|it)|(?:we'?re|you'?re)\s+(?:all\s+)?done)\b[^.!?]*[.!?]\s*/i,
        ''
      ).trim() || nextQuestionText;

  // Deterministic backstop for the "proceed with Ayurvedic questions?"
  // pattern (observed live): right on the turn hpi completes and the
  // section advances into ayurveda_profile, the model sometimes announces
  // or asks permission to continue instead of just asking the next
  // section's first question — even though intake_method is never
  // patient-chosen and this is meant to be as seamless as hpi -> drug_
  // allergy already is on allopathic sessions. Only strips LEADING
  // announcement/permission clauses on the exact turn the section changed;
  // a genuine question elsewhere is left untouched. Applied in a loop (not
  // once) because the model can produce this as two separate sentences —
  // "Let's move on to some Ayurvedic questions. Is that okay?" — and a
  // single pass only removes the first one, leaving the second dangling in
  // front of the real question. If stripping empties the string, the
  // fallback a few lines below supplies a safe generic question rather
  // than leaving the patient with nothing.
  const sectionJustAdvanced = resolvedSection !== section;
  const ANNOUNCEMENT_CLAUSE_RE =
    /^(?:(?:great|thanks|thank you|ok(?:ay)?|got it|perfect|now|next)[,!.]?\s*)?(?:(?:let'?s|i'?ll|we'?ll)\s+(?:now\s+)?(?:move on to|move into|talk about|go over|go through|ask (?:you )?(?:a few|some))|(?:is (?:that|it) (?:okay|ok|alright|fine)\??)|(?:shall we (?:continue|proceed|move on)\??)|(?:would you like to (?:continue|proceed)\??)|(?:can we (?:continue|proceed)\??))\b[^.!?]*[.!?]?\s*/i;
  function stripLeadingAnnouncements(text) {
    let out = text;
    for (let i = 0; i < 3; i += 1) {
      const next = out.replace(ANNOUNCEMENT_CLAUSE_RE, '').trim();
      if (next === out || !next) break;
      out = next;
    }
    return out;
  }
  const deAnnouncedNextQuestion = sectionJustAdvanced
    ? stripLeadingAnnouncements(cleanedNextQuestion) || cleanedNextQuestion
    : cleanedNextQuestion;

  // Last-resort fallback: the model occasionally returns a genuinely empty
  // next_question (blank string, or a field that's missing/non-string) —
  // observed in testing as a blank chat bubble the patient can't act on,
  // silently stalling the session. Never surface that; ask a safe generic
  // follow-up for whichever section is still open so the conversation can
  // always continue. finalize is excluded — an empty closing message there
  // is harmless and shouldn't get a "please continue" prompt.
  const finalNextQuestion = deAnnouncedNextQuestion || (
    resolvedSection === 'finalize'
      ? "Thanks, that's everything the doctor needs — please have a seat."
      : 'Could you tell me a bit more about that?'
  );

  const rawOptions = parsed.quick_reply_options;
  let quickReplyOptions = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? {
        options: Array.isArray(rawOptions.options) ? rawOptions.options.map(String) : [],
        allow_multiple: !!rawOptions.allow_multiple,
      }
    // Defensive fallback if the model reverts to the old bare-array shape —
    // treated as single-select, same default this field always had.
    : { options: Array.isArray(rawOptions) ? rawOptions.map(String) : [], allow_multiple: false };

  // ── Duplicate-question guard (field-key based) ────────────────────────
  // The model now declares which single field it's asking about
  // ("target_field"). If that field is ALREADY answered in the merged
  // history, this turn's question is a duplicate — regardless of how
  // differently it's worded from the earlier one, which is what the
  // text-similarity guard above can't reliably catch (observed in testing:
  // "Could you tell me how long you've been experiencing hairfall..."
  // followed later by "When did you first notice this hairfall
  // beginning?" — same hpi.onset field, wording too different to match).
  // Substitute the next genuinely-unanswered field's question instead of
  // shipping the duplicate. Only runs while staying in the same section
  // (!sectionComplete); on a section-advancing turn next_question belongs
  // to the NEXT section, which this section-scoped bank shouldn't override.
  //
  // UPDATE: target_field alone proved insufficient — the model mislabels it.
  // Observed live on one session: "When do you notice the pain or weakness
  // getting worse?" and later "Does anything specific make this issue better
  // or worse?" are both exacerbating_relieving, but were self-labelled as
  // different fields, so this guard passed them both. A third question,
  // "Which of the following describes how your symptoms behave overall
  // throughout the day?", served the SAME timing chips as two earlier turns.
  // So a question is now treated as a duplicate if ANY of three independent
  // signals says so, rather than trusting the model's own label:
  //   1. the field it DECLARED (target_field) is already answered
  //   2. the field its TEXT actually reads as (hpiFieldForQuestion) is
  //      already answered — catches mislabelling
  //   3. its OPTIONS substantially repeat a set already offered in this
  //      section — catches a re-skinned question whose wording and label
  //      both changed
  let dedupedNextQuestion = finalNextQuestion;
  if (!sectionComplete && resolvedSection !== 'finalize') {
    const capturedLeaves = new Set(
      capturedFieldKeys(mergedHistory, intakeMethod).map((k) => leafFieldName(k))
    );
    const declaredField = leafFieldName(parsed.target_field);
    // Section-aware text inference. This used to be hpi-only, which left
    // drug_allergy with no text signal — that is how "Do you have any known
    // drug allergies?" shipped again two turns later as "Do you have any
    // known drug or food allergies?".
    const textField = fieldForQuestion(section, finalNextQuestion, intakeMethod);

    const declaredIsAnswered = !!declaredField && capturedLeaves.has(declaredField);
    const textIsAnswered = !!textField && capturedLeaves.has(textField);
    const optionsRepeat = quickReplyOptions.options.length > 0
      && priorOptionSetsInSection.some((prev) => optionSetsLookRepeated(prev, quickReplyOptions.options));

    if (declaredIsAnswered || textIsAnswered || optionsRepeat) {
      const replacement = nextUnansweredQuestionFor(section, mergedHistory, intakeMethod, language);
      if (replacement) {
        dedupedNextQuestion = replacement.question;
        quickReplyOptions = { options: replacement.options, allow_multiple: replacement.allow_multiple };
      }
    }
  }

  // Options are contractually required on every question turn (see the
  // prompt's quick_reply_options rules) — but the model still drops them
  // sometimes, which strands the patient on a bare text box for a question
  // that has an obvious small answer set. Backfill from the section's
  // question bank rather than shipping an option-less turn. finalize is
  // exempt: its closing message legitimately has no options.
  if (quickReplyOptions.options.length === 0 && resolvedSection !== 'finalize' && !sectionComplete) {
    // Prefer the field the model said it was asking about, so the backfilled
    // options actually describe the question on screen; only fall back to
    // "next unanswered" when target_field is missing or unrecognized.
    const spec = questionSpecForField(leafFieldName(parsed.target_field), mergedHistory, intakeMethod, language)
      || nextUnansweredQuestionFor(section, mergedHistory, intakeMethod, language);
    if (spec) {
      quickReplyOptions = { options: spec.options, allow_multiple: spec.allow_multiple };
    }
  }

  return {
    ok: true,
    next_question: dedupedNextQuestion,
    quick_reply_options: quickReplyOptions,
    structured_history: mergedHistory,
    section: resolvedSection,
    section_complete: sectionComplete,
    red_flag: redFlag,
    red_flag_reason: redFlagReason,
    // True only on the turn where red_flag first flips to true (history.red_flag
    // was false/unset going in, redFlag is true coming out) — lets the caller
    // show the Priority Alert exactly once, rather than re-showing it every
    // turn for the rest of a flagged session (red_flag itself stays true and
    // is returned every turn, sticky, per the rule above).
    red_flag_is_new: redFlag && !history.red_flag,
    degraded: false,
  };
}

export { emptyStructuredHistory, hpiComplete, ayurvedaComplete, SECTIONS_ALLOPATHIC, SECTIONS_AYURVEDIC, sectionsFor };

// Internal helpers exposed for unit testing only — same convention as
// aiClient.js's __testing export. Not part of the module's real surface.
export const __testing = {
  hpiFieldForQuestion,
  optionSetsLookRepeated,
  questionsLookRepeated,
  capturedFieldKeys,
  leafFieldName,
  nextUnansweredQuestionFor,
  questionSpecForField,
  isSystemicComplaint,
  markInapplicableHpiFields,
  fieldForQuestion,
  drugAllergyFieldForQuestion,
};

/**
 * Creates a new intake_sessions row and runs the first turn (empty
 * structured_history, section "chief_complaint", no patient message yet —
 * the first turn just asks the patient to state their complaint).
 *
 * @param {string} patientId
 * @param {{ doctorId?: string, intakeMethod?: 'allopathic'|'ayurvedic', origin?: 'remote'|'clinic_checkin' }} [options]
 *   doctorId/intakeMethod/origin are only ever populated by the clinic
 *   check-in flow (backend/routes/clinic.js), which resolves intakeMethod
 *   from the doctor's OWN row server-side — never patient-supplied. The
 *   plain remote flow (POST /api/intake/start) calls this with no options,
 *   preserving origin='remote'/intake_method='allopathic' defaults exactly
 *   as before this feature.
 */
export async function startIntakeSession(patientId, { doctorId = null, intakeMethod = 'allopathic', origin = 'remote', language = 'hi-IN' } = {}) {
  if (!patientId) throw new Error('startIntakeSession: patientId is required');

  const structuredHistory = emptyStructuredHistory(intakeMethod);
  const turn = await runIntakeTurn({
    section: 'chief_complaint',
    structuredHistory,
    patientMessage: '(session just started — greet the patient and ask them to describe their main complaint today)',
    intakeMethod,
    language,
  });

  const { data, error } = await supabase
    .from('intake_sessions')
    .insert({
      patient_id: patientId,
      doctor_id: doctorId,
      origin,
      intake_method: intakeMethod,
      // Voice layer (Phase 7a): chosen once here and read back on every
      // turn, never re-derived per-turn from the patient's answer
      // (Voice Layer PRD §6). Purely a TTS concern — the dialogue engine
      // itself does not branch on it.
      language,
      status: 'in_progress',
      structured_history: turn.structured_history,
      turns: [{ role: 'assistant', text: turn.next_question, section: turn.section, options: turn.quick_reply_options?.options || [], at: new Date().toISOString() }],
      priority: turn.red_flag ? 'flagged' : 'routine',
      red_flag_reason: turn.red_flag_reason,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`startIntakeSession: failed to create session: ${error.message}`);
  }

  return { session: data, turn };
}

/**
 * Loads the session, runs the next dialogue turn from the patient's answer,
 * and persists the updated structured_history/turns/priority. Ownership
 * (session.patient_id === callerId) must already be verified by the caller
 * (route), same pattern as doctorPatients.js link-ownership checks.
 *
 * @param {{ sessionId: string, patientMessage: string }} params
 */
export async function advanceIntakeSession({ sessionId, patientMessage }) {
  if (!sessionId) throw new Error('advanceIntakeSession: sessionId is required');
  if (!patientMessage || !patientMessage.trim()) {
    throw new Error('advanceIntakeSession: patientMessage is required');
  }

  const { data: session, error: fetchError } = await supabase
    .from('intake_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (fetchError || !session) {
    throw new Error(`advanceIntakeSession: session not found: ${fetchError?.message || sessionId}`);
  }
  if (session.status === 'completed') {
    throw new Error('advanceIntakeSession: session already completed');
  }

  // structured_history.section is the persisted state-machine position
  // (see emptyStructuredHistory) — read directly rather than re-derived,
  // since deriving it from field contents alone is ambiguous (an empty
  // drug_allergy array can mean "not asked" or "asked, answer was none").
  const currentSection = session.structured_history?.section || 'chief_complaint';
  // intake_method is read from the session row's own snapshot — never
  // re-derived from the doctor's CURRENT treatment_method (PRD §3.4: "never
  // re-derived from a doctor's current setting on read").
  const intakeMethod = session.intake_method || 'allopathic';

  // Last assistant turn is what the patient's message is answering — fed
  // back into the prompt so the model always has explicit context on what
  // it just asked. Separately, every assistant question asked so far in
  // the CURRENT section (not just the last one) is passed through for the
  // repetition guard below — the model doesn't always ask fields in the
  // documented order, so a repeat can echo a question from a few turns
  // back, not only the immediately preceding one.
  const priorTurns = Array.isArray(session.turns) ? session.turns : [];
  const lastAssistantTurn = [...priorTurns].reverse().find((t) => t.role === 'assistant');
  const lastQuestion = lastAssistantTurn?.text || null;
  const priorQuestionsInSection = priorTurns
    .filter((t) => t.role === 'assistant' && t.section === currentSection && typeof t.text === 'string')
    .map((t) => t.text);
  // Option sets already offered in this section — a question re-skinned with
  // new wording almost always keeps ~the same chips, so this catches repeats
  // that neither the text-similarity nor the field-key check can (observed
  // live: three different-sounding questions all served
  // ["Constant throughout the day","Worse in the morning",...]).
  const priorOptionSetsInSection = priorTurns
    .filter((t) => t.role === 'assistant' && t.section === currentSection && Array.isArray(t.options) && t.options.length > 0)
    .map((t) => t.options);
  // Pair each prior assistant question in this section with the patient turn
  // that answered it. Needed because a repeated question is usually a repeat
  // of an OLDER question, not the one just asked — so recovering that
  // question's own answer is the only way to back-fill the right value.
  // Writing the CURRENT patientMessage instead (what the guards used to do)
  // silently files one field's answer under another field.
  const priorQaInSection = priorTurns.reduce((acc, t, i) => {
    if (t.role === 'assistant' && t.section === currentSection && typeof t.text === 'string') {
      const next = priorTurns[i + 1];
      if (next && next.role === 'patient' && typeof next.text === 'string' && next.text.trim()) {
        acc.push({ question: t.text, answer: next.text.trim() });
      }
    }
    return acc;
  }, []);

  const turn = await runIntakeTurn({
    section: currentSection,
    structuredHistory: session.structured_history,
    patientMessage: patientMessage.trim(),
    intakeMethod,
    lastQuestion,
    priorQuestionsInSection,
    priorOptionSetsInSection,
    priorQaInSection,
    // Read from the session row's own snapshot, like intake_method above —
    // the language was fixed once at /intake/start and must not be
    // re-derived per turn (Voice Layer PRD §6).
    language: session.language || 'hi-IN',
  });

  const nowIso = new Date().toISOString();
  const updatedTurns = [
    ...(Array.isArray(session.turns) ? session.turns : []),
    { role: 'patient', text: patientMessage.trim(), at: nowIso },
    { role: 'assistant', text: turn.next_question, section: turn.section, options: turn.quick_reply_options?.options || [], at: nowIso },
  ];

  const { data: updated, error: updateError } = await supabase
    .from('intake_sessions')
    .update({
      structured_history: turn.structured_history,
      turns: updatedTurns,
      chief_complaint: turn.structured_history.chief_complaint || session.chief_complaint || null,
      priority: turn.red_flag ? 'flagged' : session.priority,
      red_flag_reason: turn.red_flag ? turn.red_flag_reason : session.red_flag_reason,
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`advanceIntakeSession: failed to persist turn: ${updateError.message}`);
  }

  return { session: updated, turn };
}

/**
 * Marks a session complete. No dialogue-engine call — finalize is a pure
 * status transition per PRD §6.1's state machine (chief_complaint -> hpi ->
 * [ayurveda_profile ->] drug_allergy -> finalize).
 */
export async function finalizeIntakeSession(sessionId) {
  if (!sessionId) throw new Error('finalizeIntakeSession: sessionId is required');

  const { data, error } = await supabase
    .from('intake_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw new Error(`finalizeIntakeSession: failed to finalize session: ${error.message}`);
  }
  return data;
}
