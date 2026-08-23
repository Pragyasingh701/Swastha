// Module A — Conversational History Engine: text-only dialogue engine.
//
// State machine over sections: chief_complaint -> hpi (loops until SOCRATES
// fields filled) -> drug_allergy -> finalize. One runAI('intake-dialogue')
// call per patient turn returns forced JSON with the next question, updated
// structured_history fields, and an independent red-flag check (PRD §6.1 —
// red-flag check runs on every turn regardless of section progress).
//
// Never suggests a diagnosis — the prompt is deliberately restricted to
// asking SOCRATES-style follow-ups and structuring what the patient said,
// per PRD §4 (no autonomous diagnosis) and §6.1.
import { supabase } from '../config/supabase.js';
import { runAI } from '../config/aiClient.js';

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
// per PRD §7.
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

const SECTIONS = ['chief_complaint', 'hpi', 'drug_allergy', 'finalize'];

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

function emptyStructuredHistory() {
  return {
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

function buildSystemPrompt(section, structuredHistory) {
  return `You are a clinical intake assistant for an Indian OPD (outpatient) clinic. You are talking directly to a PATIENT before their doctor consult, gathering a structured history. You NEVER diagnose, suggest a condition, or give medical advice — you only ask focused follow-up questions and structure what the patient tells you.

Current section: "${section}"
Section flow: chief_complaint -> hpi (SOCRATES-style follow-ups) -> drug_allergy -> finalize.

Structured history so far (jsonb, do not remove existing fields, only add/update):
${JSON.stringify(structuredHistory, null, 2)}

Section rules:
- "chief_complaint": ask the patient to state their main complaint if not yet captured. One short question. Once you have a clear chief complaint, move to "hpi".
- "hpi": ask SOCRATES-style follow-ups (Site, Onset, Character, Radiation, Associated symptoms, Timing, Exacerbating/relieving factors, Severity) ONE OR TWO AT A TIME — never ask all 8 in one question. Only ask about fields still empty in hpi above. Offer short quick_reply_options where a patient would naturally pick from a small set (e.g. severity 1-10 buttons, yes/no for a symptom). When every hpi field is filled, set section_complete: true for this turn and the caller will advance to "drug_allergy".
- "drug_allergy": ask about current medications and known drug/food allergies. Once captured (even if the answer is "none"), set section_complete: true.
- "finalize": no more questions — the session is being closed. Return next_question as a short closing message (e.g. "Thanks, that's everything the doctor needs — please have a seat.") and quick_reply_options as [].

Red-flag check (run this on EVERY turn regardless of section, independent of section progress):
The following symptom patterns are red flags that must be surfaced immediately:
${RED_FLAG_TRIGGERS.map((t) => `- ${t}`).join('\n')}
If the patient's most recent message or anything already in structured_history matches one of these, set red_flag: true and red_flag_reason to a short clinical phrase naming which pattern matched (e.g. "Chest pain with radiation to left arm"). Once true, red_flag stays true for the rest of the session even if a later turn doesn't re-mention it — never flip it back to false.

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "next_question": "<the next question or closing message to show the patient>",
  "quick_reply_options": ["<short tappable option>", "..."],
  "updated_fields": {
    "chief_complaint": "<string, only if this turn updated it, else omit>",
    "hpi": { "<only the hpi fields this turn updated>": "<value>" },
    "drug_allergy": { "<only the drug_allergy fields this turn updated>": "<value>" }
  },
  "section_complete": <true if the CURRENT section ("${section}") is now fully captured, else false>,
  "red_flag": <true|false>,
  "red_flag_reason": "<short reason if red_flag is true, else null>"
}

Rules for the JSON:
- "quick_reply_options" should have 0-4 short items — omit (empty array) for open-ended questions where tapping doesn't make sense (e.g. "describe the pain in your own words").
- "updated_fields" should ONLY contain fields the patient's latest message actually gave information for — never invent or guess values for fields they didn't address.
- "severity" in hpi, if provided, must be an integer 1-10.
- Never include a diagnosis, condition name, or treatment suggestion anywhere in your response.`;
}

function mergeStructuredHistory(current, updatedFields) {
  const next = {
    ...current,
    section: current.section, // set by the caller after merging, via nextSection()
    hpi: { ...current.hpi },
    drug_allergy: { ...current.drug_allergy },
  };
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

function nextSection(current, sectionComplete) {
  if (!sectionComplete) return current;
  const idx = SECTIONS.indexOf(current);
  if (idx === -1 || idx === SECTIONS.length - 1) return current;
  return SECTIONS[idx + 1];
}

/**
 * Runs one dialogue-engine turn: builds the prompt from current
 * structured_history + section, calls runAI('intake-dialogue'), and returns
 * the parsed/validated turn result plus the merged structured_history and
 * next section. Does NOT touch the database — callers (routes) own reading/
 * writing the intake_sessions row, same boundary as searchService.js not
 * owning `reports`.
 *
 * @param {{ section: string, structuredHistory: object, patientMessage: string }} params
 */
export async function runIntakeTurn({ section, structuredHistory, patientMessage }) {
  if (!SECTIONS.includes(section)) {
    throw new Error(`runIntakeTurn: unknown section "${section}"`);
  }
  const history = structuredHistory && typeof structuredHistory === 'object'
    ? structuredHistory
    : emptyStructuredHistory();

  const prompt = `${buildSystemPrompt(section, history)}\n\nPatient's latest message: "${(patientMessage || '').trim()}"`;

  const gen = await runAI({ task: 'intake-dialogue', input: prompt, json: true, label: 'intake-dialogue' });

  if (!gen.ok) {
    // Degrade the same way searchService/labInsights do: never throw a raw
    // 500 for a generation-class task. The session stays in_progress and the
    // patient sees the friendly fallback as the "question" — caller can
    // retry the same turn.
    return {
      ok: false,
      next_question: gen.text,
      quick_reply_options: [],
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

  const mergedHistory = {
    ...mergeStructuredHistory(history, parsed.updated_fields),
    red_flag: redFlag,
    red_flag_reason: redFlagReason,
  };

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

  const resolvedSection = nextSection(section, sectionComplete);
  mergedHistory.section = resolvedSection;

  return {
    ok: true,
    next_question: typeof parsed.next_question === 'string' ? parsed.next_question.trim() : '',
    quick_reply_options: Array.isArray(parsed.quick_reply_options) ? parsed.quick_reply_options.map(String) : [],
    structured_history: mergedHistory,
    section: resolvedSection,
    section_complete: sectionComplete,
    red_flag: redFlag,
    red_flag_reason: redFlagReason,
    degraded: false,
  };
}

export { emptyStructuredHistory, hpiComplete, SECTIONS };

/**
 * Creates a new intake_sessions row and runs the first turn (empty
 * structured_history, section "chief_complaint", no patient message yet —
 * the first turn just asks the patient to state their complaint).
 *
 * @param {string} patientId
 */
export async function startIntakeSession(patientId) {
  if (!patientId) throw new Error('startIntakeSession: patientId is required');

  const structuredHistory = emptyStructuredHistory();
  const turn = await runIntakeTurn({
    section: 'chief_complaint',
    structuredHistory,
    patientMessage: '(session just started — greet the patient and ask them to describe their main complaint today)',
  });

  const { data, error } = await supabase
    .from('intake_sessions')
    .insert({
      patient_id: patientId,
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

  const turn = await runIntakeTurn({
    section: currentSection,
    structuredHistory: session.structured_history,
    patientMessage: patientMessage.trim(),
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
 * drug_allergy -> finalize).
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
