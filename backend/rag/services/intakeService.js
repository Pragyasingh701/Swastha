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

function buildSystemPrompt(section, structuredHistory, intakeMethod, lastQuestion) {
  const isAyurvedic = intakeMethod === 'ayurvedic';
  const flowDescription = isAyurvedic
    ? 'chief_complaint -> hpi (SOCRATES-style follow-ups) -> ayurveda_profile (Ayurvedic constitution & lifestyle) -> drug_allergy -> finalize'
    : 'chief_complaint -> hpi (SOCRATES-style follow-ups) -> drug_allergy -> finalize';

  const sectionRules = [
    `- "chief_complaint": ask the patient to state their main complaint if not yet captured. One short question. Once they answer, extract chief_complaint (a short clinical phrase for what's wrong) AND, only if the patient actually volunteered them in this same message, also capture duration into hpi.onset and any aggravating/relieving factor into hpi.exacerbating_relieving — never ask separate follow-up questions for those here, only capture what they already said unprompted (this avoids re-asking the same thing again once "hpi" starts). Once chief_complaint is captured, move to "hpi".`,
    `- "hpi": ask SOCRATES-style follow-ups (Site, Onset, Character, Radiation, Associated symptoms, Timing, Exacerbating/relieving factors, Severity) ONE OR TWO AT A TIME — never ask all 8 in one question. Only ask about fields still empty in hpi above (skip any already filled from chief_complaint's extraction). Only ask what's clinically relevant to THIS chief_complaint — do not ask a generic fixed checklist. Tailor which fields you probe and how to the complaint type, for example: pain/ache complaints -> site, character, radiation, severity, aggravating/relieving factors; headache -> location, duration, severity, triggers, vision changes, nausea/vomiting; cough -> duration, dry vs productive, fever, breathing difficulty, blood in sputum; skin complaints -> location, itching, duration, rash appearance, triggers; joint complaints -> which joint(s), duration, swelling, stiffness, pain on movement. Always also check associated_symptoms relevant to that complaint type (e.g. vomiting/fever/loose motion/constipation/bloating/loss of appetite for abdominal complaints). Phrase each question short and direct, clinical-questionnaire style (e.g. "How is your pain normally?" / "How would you describe X?"), NOT a long or casual sentence with asides. Offer more than a minimal set of short quick_reply_options where a patient would naturally pick from a small set (more than 2 closed options where the option set supports it — e.g. severity 1-10 buttons, or 3+ options for a symptom quality rather than a bare yes/no where richer options make sense), each option a single short phrase (one attribute, not several stacked together). When every hpi field is filled, set section_complete: true for this turn and the caller will advance to "${isAyurvedic ? 'ayurveda_profile' : 'drug_allergy'}".`,
  ];
  if (isAyurvedic) {
    sectionRules.push(buildAyurvedaSectionRules(structuredHistory));
  }
  sectionRules.push(
    `- "drug_allergy": ask about current medications and known drug/food allergies — TWO separate questions (medications first, then allergies), never bundled into one, and never ask either one more than once. When the patient answers "none"/"no" to either, still write a non-empty array for it — e.g. current_medications: ["None"] or allergies: ["None"] — NEVER leave it as an empty array or omit it, since an empty array cannot be distinguished from "not asked yet". Once BOTH current_medications and allergies are each a non-empty array, set section_complete: true.`,
    `- "finalize": no more questions — the session is being closed. Return next_question as a short closing message (e.g. "Thanks, that's everything the doctor needs — please have a seat.") and quick_reply_options as { "options": [], "allow_multiple": false }.`
  );

  return `You are a clinical intake assistant for an Indian OPD (outpatient) clinic. You are talking directly to a PATIENT before their doctor consult, gathering a structured history. You NEVER diagnose, suggest a condition, or give medical advice — you only ask focused follow-up questions and structure what the patient tells you. This applies identically whether the consulting doctor practices allopathic or Ayurvedic medicine — do not suggest a diagnosis, condition, dosha imbalance conclusion, or treatment in either case.

Current section: "${section}"
Section flow: ${flowDescription}.
${isAyurvedic ? 'This patient\'s doctor practices Ayurvedic medicine — the extra "ayurveda_profile" section below gathers constitutional/lifestyle detail their approach depends on. Never ask the patient which kind of doctor they are seeing or which question set to use — that is already decided.' : ''}
${lastQuestion ? `\nThe question you JUST asked the patient (their "Patient's latest message" below is a direct answer to THIS): "${lastQuestion}"\n` : ''}
Structured history so far (jsonb, do not remove existing fields, only add/update):
${JSON.stringify(structuredHistory, null, 2)}

Section rules:
${sectionRules.join('\n')}

CRITICAL — extracting the answer (this is the #1 failure mode to avoid): the patient's latest message is their answer to the question you just asked above. You MUST parse whatever they said — including short, casual, or indirect phrasing ("a week ago", "over the last few days", "comes and goes"), typos, and single-word free-text answers — into the matching field(s) in "updated_fields" this same turn. Never re-ask the same field again just because their wording wasn't a clean match to your options; interpret it and move on. This applies EQUALLY to free-text fields (e.g. food_intolerances, recent_stressors, home_remedies) — a short or oddly-spelled reply to a free-text question is still a real answer, record it as-is.
Do NOT output a next_question that repeats — verbatim or reworded — ANY question you have already asked earlier in this same section, even one from several turns back. Keep track of every field you've already asked about in this section (see structured history above) and always move to a genuinely different still-empty one, or advance the section, once the patient has answered.

Red-flag check (run this on EVERY turn regardless of section, independent of section progress):
The following symptom patterns are red flags that must be surfaced immediately:
${RED_FLAG_TRIGGERS.map((t) => `- ${t}`).join('\n')}
If the patient's most recent message or anything already in structured_history matches one of these, set red_flag: true and red_flag_reason to a short clinical phrase naming which pattern matched (e.g. "Chest pain with radiation to left arm"). Once true, red_flag stays true for the rest of the session even if a later turn doesn't re-mention it — never flip it back to false.

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "next_question": "<the next question or closing message to show the patient>",
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
- "quick_reply_options.options" should have 0-6 short items — leave it empty for open-ended questions where tapping doesn't make sense (e.g. "describe the pain in your own words") or for free-text fields explicitly marked as such. Offer MORE than a bare minimal set of options wherever the question has a natural closed answer set (more than 2 options where the option set supports it).
- "quick_reply_options.allow_multiple" must be true whenever more than one answer can genuinely apply to the question just asked (e.g. multiple symptoms, multiple tastes, multiple moods) — false otherwise.
- "updated_fields" should ONLY contain fields the patient's latest message actually gave information for — never invent or guess values for fields they didn't address.
- "severity" in hpi, if provided, must be an integer 1-10.
- Never include a diagnosis, condition name, dosha-imbalance conclusion, or treatment suggestion anywhere in your response.
- "next_question" must not contradict "section_complete": if section_complete is false, never phrase next_question as a wrap-up ("that completes...", "that's everything...", "last question...", "great, all done with X") right before still going on to ask something else in the SAME response — that reads as the assistant contradicting itself mid-message. Only use wrap-up phrasing on the turn where section_complete is actually true (or, within ayurveda_profile, only once every one of its sub-sections is done).`;
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

/**
 * Runs one dialogue-engine turn: builds the prompt from current
 * structured_history + section + intake_method, calls
 * runAI('intake-dialogue'), and returns the parsed/validated turn result
 * plus the merged structured_history and next section. Does NOT touch the
 * database — callers (routes) own reading/writing the intake_sessions row,
 * same boundary as searchService.js not owning `reports`.
 *
 * @param {{ section: string, structuredHistory: object, patientMessage: string, intakeMethod?: 'allopathic'|'ayurvedic', lastQuestion?: string, priorQuestionsInSection?: string[] }} params
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
export async function runIntakeTurn({ section, structuredHistory, patientMessage, intakeMethod = 'allopathic', lastQuestion = null, priorQuestionsInSection = [] }) {
  const sections = sectionsFor(intakeMethod);
  if (!sections.includes(section)) {
    throw new Error(`runIntakeTurn: unknown section "${section}" for intake_method "${intakeMethod}"`);
  }
  const history = structuredHistory && typeof structuredHistory === 'object'
    ? structuredHistory
    : emptyStructuredHistory(intakeMethod);

  const prompt = `${buildSystemPrompt(section, history, intakeMethod, lastQuestion)}\n\nPatient's latest message: "${(patientMessage || '').trim()}"`;

  const gen = await runAI({ task: 'intake-dialogue', input: prompt, json: true, label: 'intake-dialogue' });

  if (!gen.ok) {
    // Degrade the same way searchService/labInsights do: never throw a raw
    // 500 for a generation-class task. The session stays in_progress and the
    // patient sees the friendly fallback as the "question" — caller can
    // retry the same turn.
    return {
      ok: false,
      next_question: gen.text,
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

  // red_flag is sticky — once true, never flips back to false even if the
  // model didn't re-detect it this turn (PRD §6.1: independent of section
  // progress, and a missed re-mention should never un-flag a session).
  const redFlag = !!history.red_flag || !!parsed.red_flag;
  const redFlagReason = history.red_flag ? history.red_flag_reason : (parsed.red_flag ? (parsed.red_flag_reason || 'Red flag detected') : null);

  let mergedHistory = {
    ...mergeStructuredHistory(history, parsed.updated_fields, intakeMethod),
    red_flag: redFlag,
    red_flag_reason: redFlagReason,
  };

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

    if (repeatedQuestion && section === 'hpi') {
      const targetField = HPI_FIELDS.find((f) => {
        const v = history.hpi?.[f];
        if (f === 'associated_symptoms') return !Array.isArray(v) || v.length === 0;
        if (f === 'severity') return v === null || v === undefined || v === '';
        return !(typeof v === 'string' && v.trim() !== '');
      });
      if (targetField && targetField !== 'associated_symptoms' && targetField !== 'severity') {
        const stillEmpty = !(typeof mergedHistory.hpi?.[targetField] === 'string' && mergedHistory.hpi[targetField].trim() !== '');
        if (stillEmpty) {
          mergedHistory = {
            ...mergedHistory,
            hpi: { ...mergedHistory.hpi, [targetField]: patientMessage.trim() },
          };
        }
      }
    }

    if (repeatedQuestion && section === 'ayurveda_profile') {
      // Match the repeated question back to a known ayurveda field by its
      // canonical question text (not by assumed order), then write the raw
      // answer in if that field is still genuinely empty after the merge —
      // never overwrites a field the model DID correctly capture.
      const match = AYURVEDA_QUESTION_INDEX.find((q) => questionsLookRepeated(q.question, repeatedQuestion));
      if (match && !AYURVEDA_ARRAY_FIELDS.has(match.field)) {
        const profile = mergedHistory.ayurveda_profile || emptyAyurvedaProfile();
        const currentValue = match.group ? profile[match.group]?.[match.field] : profile[match.field];
        const stillEmpty = !(typeof currentValue === 'string' && currentValue.trim() !== '');
        if (stillEmpty) {
          const nextProfile = {
            ...profile,
            [match.group]: match.group ? { ...profile[match.group], [match.field]: patientMessage.trim() } : profile[match.group],
          };
          if (!match.group) nextProfile[match.field] = patientMessage.trim();
          mergedHistory = { ...mergedHistory, ayurveda_profile: nextProfile };
        }
      }
    }

    // "drug_allergy" only has two turn-worthy questions — medications, then
    // allergies — so the field to target is inferred straight from what the
    // repeated question is actually about (word match), not from field
    // order. current_medications/allergies are arrays (backend stores the
    // raw answer as a single-item list rather than attempting to split it —
    // same "imperfect but honest capture" tradeoff as the hpi/ayurveda
    // fallbacks above), and only fills in if the model genuinely left that
    // field untouched (observed in testing: "What medications are you
    // currently taking?" asked twice back to back, dropping "None").
    if (repeatedQuestion && section === 'drug_allergy') {
      const isAboutAllergies = /allerg/i.test(repeatedQuestion);
      const isAboutMedications = /medicat/i.test(repeatedQuestion);
      if (isAboutMedications && mergedHistory.drug_allergy.current_medications.length === 0) {
        mergedHistory = {
          ...mergedHistory,
          drug_allergy: { ...mergedHistory.drug_allergy, current_medications: [patientMessage.trim()] },
        };
      } else if (isAboutAllergies && mergedHistory.drug_allergy.allergies.length === 0) {
        mergedHistory = {
          ...mergedHistory,
          drug_allergy: { ...mergedHistory.drug_allergy, allergies: [patientMessage.trim()] },
        };
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

  // Last-resort fallback: the model occasionally returns a genuinely empty
  // next_question (blank string, or a field that's missing/non-string) —
  // observed in testing as a blank chat bubble the patient can't act on,
  // silently stalling the session. Never surface that; ask a safe generic
  // follow-up for whichever section is still open so the conversation can
  // always continue. finalize is excluded — an empty closing message there
  // is harmless and shouldn't get a "please continue" prompt.
  const finalNextQuestion = cleanedNextQuestion || (
    resolvedSection === 'finalize'
      ? "Thanks, that's everything the doctor needs — please have a seat."
      : 'Could you tell me a bit more about that?'
  );

  const rawOptions = parsed.quick_reply_options;
  const quickReplyOptions = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
    ? {
        options: Array.isArray(rawOptions.options) ? rawOptions.options.map(String) : [],
        allow_multiple: !!rawOptions.allow_multiple,
      }
    // Defensive fallback if the model reverts to the old bare-array shape —
    // treated as single-select, same default this field always had.
    : { options: Array.isArray(rawOptions) ? rawOptions.map(String) : [], allow_multiple: false };

  return {
    ok: true,
    next_question: finalNextQuestion,
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
export async function startIntakeSession(patientId, { doctorId = null, intakeMethod = 'allopathic', origin = 'remote' } = {}) {
  if (!patientId) throw new Error('startIntakeSession: patientId is required');

  const structuredHistory = emptyStructuredHistory(intakeMethod);
  const turn = await runIntakeTurn({
    section: 'chief_complaint',
    structuredHistory,
    patientMessage: '(session just started — greet the patient and ask them to describe their main complaint today)',
    intakeMethod,
  });

  const { data, error } = await supabase
    .from('intake_sessions')
    .insert({
      patient_id: patientId,
      doctor_id: doctorId,
      origin,
      intake_method: intakeMethod,
      status: 'in_progress',
      structured_history: turn.structured_history,
      turns: [{ role: 'assistant', text: turn.next_question, section: turn.section, at: new Date().toISOString() }],
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

  const turn = await runIntakeTurn({
    section: currentSection,
    structuredHistory: session.structured_history,
    patientMessage: patientMessage.trim(),
    intakeMethod,
    lastQuestion,
    priorQuestionsInSection,
  });

  const nowIso = new Date().toISOString();
  const updatedTurns = [
    ...(Array.isArray(session.turns) ? session.turns : []),
    { role: 'patient', text: patientMessage.trim(), at: nowIso },
    { role: 'assistant', text: turn.next_question, section: turn.section, at: nowIso },
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
