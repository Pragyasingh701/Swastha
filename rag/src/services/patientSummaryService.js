// Routed through the shared failover client: Gemini (4 keys) -> OpenRouter.
import { runAI } from '../config/aiClient.js';

// Doctor-facing patient summary: unlike summaryService.js (one report) or
// labInsightsService.js (lab reports only, chart-shaped output), this
// covers a patient's FULL timeline across every category and produces a
// structured, scannable summary (sections, not a single paragraph) a
// doctor can read before a visit.

// Strips ```json fences etc. that free-tier chat models routinely wrap
// around JSON output despite being asked not to — same helper as
// labInsightsService.js.
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

function buildReportBlock(report, index) {
  const { title, category, doctor, hospital, reportDate, diagnosis, medicines, notes, analysis } = report;
  const lines = [`Record #${index + 1}`];
  const append = (label, value) => {
    if (value && String(value).trim()) lines.push(`  ${label}: ${String(value).trim()}`);
  };
  append('Date', reportDate);
  append('Category', category);
  append('Title', title);
  append('Doctor', doctor);
  append('Hospital', hospital);
  append('Diagnosis / Findings', diagnosis);
  append('Medicines / Results', medicines);
  append('Notes', notes);
  append('Existing AI Summary', analysis);
  return lines.join('\n');
}

/**
 * @param {string} patientName
 * @param {Array<object>} reports - the patient's full timeline, any order
 *   (dates are in the data, the model sorts by them).
 * @returns {{
 *   overview: string,
 *   diagnoses: string[],
 *   medications: string[],
 *   trends: string[],
 *   followUps: string[],
 * }}
 */
export async function summarizePatientTimeline(patientName, reports) {
  if (!Array.isArray(reports) || reports.length === 0) {
    throw new Error('summarizePatientTimeline: no reports provided');
  }

  const sorted = [...reports].sort(
    (a, b) => new Date(a.reportDate || 0) - new Date(b.reportDate || 0)
  );
  const reportBlocks = sorted.map(buildReportBlock).join('\n\n');
  const name = patientName && String(patientName).trim() ? String(patientName).trim() : 'this patient';

  const prompt = `You are a clinical assistant helping a doctor quickly review a patient's history. Below is ${name}'s full medical record timeline, in free-text form, oldest to newest.

${reportBlocks}

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "overview": "<1-2 sentence overall picture of the patient's condition/history, grounded in the records above>",
  "diagnoses": ["<short diagnosis or finding, one per item>"],
  "medications": ["<short medicine/dosage note, one per item>"],
  "trends": ["<something recurring or trending across multiple records, e.g. a repeated diagnosis, a lab value mentioned more than once, a recent change in treatment>"],
  "followUps": ["<a follow-up the records themselves suggest, e.g. a stated upcoming need or an abnormal trend>"]
}

Rules:
- Only use what is explicitly stated in the records — never invent values, diagnoses, medications, or trends not present in the text.
- Each array item should be short (under ~15 words), scannable as a bullet point, not a full sentence.
- If a section has nothing to report, return an empty array (or empty string for "overview") — do not fabricate content to fill it in.
- "trends" and "followUps" should only be populated when the records genuinely support them (e.g. the same diagnosis appears more than once, a medication changed between visits) — do not invent generic trends.`;

  const res = await runAI({ task: 'generation', input: prompt, label: 'patient-summary' });

  // Same reasoning as labInsightsService.js: check `ok` before trusting
  // `text` as real output — on total provider exhaustion `text` is just
  // the friendly fallback sentence, not JSON, and would otherwise surface
  // as a confusing "unparsable output" error instead of the real cause.
  if (!res.ok) {
    throw new Error(`Patient summary generation unavailable: ${res.error_code}`);
  }

  let parsed;
  try {
    parsed = extractJson(res.text);
  } catch (err) {
    throw new Error(`Patient summary model returned unparsable output: ${err.message}`);
  }

  const toStringArray = (value) =>
    Array.isArray(value)
      ? value.filter((v) => v && String(v).trim()).map((v) => String(v).trim())
      : [];

  return {
    overview: typeof parsed.overview === 'string' ? parsed.overview.trim() : '',
    diagnoses: toStringArray(parsed.diagnoses),
    medications: toStringArray(parsed.medications),
    trends: toStringArray(parsed.trends),
    followUps: toStringArray(parsed.followUps),
  };
}
