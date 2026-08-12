import { generateGroundedAnswer } from '../config/openrouter.js';

// Lab Insights needs numbers a chart can plot, but reports only ever store
// free text ("Key Results / Values" like "Hemoglobin 13.2 g/dL, WBC
// 7,200/µL", or an AI Summary paragraph) — there is no structured
// {testName, value, unit} column anywhere. Rather than a brittle regex
// parser that only catches phrasings we thought to anticipate, one
// OpenRouter call extracts every discrete numeric test result out of ALL
// of the user's Lab Report entries at once, plus writes the AI health
// score / physician's summary / follow-up suggestions — all grounded in
// the same real records, nothing invented beyond what's stated.

function buildReportBlock(report, index) {
  const { title, doctor, hospital, reportDate, diagnosis, medicines, notes, analysis } = report;
  const lines = [`Report #${index + 1}`];
  const append = (label, value) => {
    if (value && String(value).trim()) lines.push(`  ${label}: ${String(value).trim()}`);
  };
  append('Date', reportDate);
  append('Doctor', doctor);
  append('Hospital', hospital);
  append('Test / Panel', title || diagnosis);
  append('Key Results / Values', medicines);
  append('Notes', notes);
  append('AI Summary', analysis);
  return lines.join('\n');
}

// Strips ```json fences etc. that free-tier chat models routinely wrap
// around JSON output despite being asked not to.
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

/**
 * @param {Array<object>} labReports - the user's reports already filtered
 *   to category === "Lab Report" / "Lab Reports", newest-first or any
 *   order (dates are in the data, the model sorts by them).
 * @returns {{
 *   healthScore: number|null,
 *   healthScoreNote: string,
 *   series: Array<{ testName: string, unit: string, normalRange: string,
 *     points: Array<{ date: string, value: number }> }>,
 *   physicianSummary: Array<{ title: string, body: string, tone: "good"|"watch"|"neutral" }>,
 *   followUps: Array<{ title: string, reason: string }>,
 * }}
 */
export async function generateLabInsights(labReports) {
  if (!Array.isArray(labReports) || labReports.length === 0) {
    throw new Error('generateLabInsights: no lab reports provided');
  }

  const reportBlocks = labReports.map(buildReportBlock).join('\n\n');

  const prompt = `You are a clinical data assistant. Below are a patient's Lab Report records, in free-text form. Extract ONLY what is explicitly stated — never invent values, dates, or findings.

${reportBlocks}

Return ONLY a single JSON object (no prose, no markdown fences) with this exact shape:
{
  "healthScore": <integer 0-100 reflecting overall lab trends, or null if there isn't enough data to judge>,
  "healthScoreNote": "<one short sentence explaining the score, grounded in the records above>",
  "series": [
    {
      "testName": "<e.g. HbA1c, LDL Cholesterol, Vitamin D>",
      "unit": "<e.g. %, mg/dL, ng/mL — empty string if unclear>",
      "normalRange": "<e.g. 70-100 — empty string if unknown>",
      "points": [ { "date": "<YYYY-MM-DD from the report's Date field>", "value": <number> } ]
    }
  ],
  "physicianSummary": [
    { "title": "<short heading, e.g. Metabolic Health>", "body": "<1-2 sentences, grounded in the records>", "tone": "good" | "watch" | "neutral" }
  ],
  "followUps": [
    { "title": "<e.g. Lipid Profile Recheck>", "reason": "<short reason based on the records, e.g. LDL trending up>" }
  ]
}

Rules:
- Only include a test in "series" if it appears with a numeric value in at least one report. Group same test across multiple reports/dates into one series entry, sorted by date ascending.
- If nothing numeric can be extracted at all, return "series": [].
- "physicianSummary" should have 1-3 items, only about things actually supported by the records.
- "followUps" should have 0-3 items — only suggest a follow-up if the records give a real reason (an abnormal trend, a stated upcoming need, etc). Do not invent generic advice.
- If there isn't enough information for a field, use an empty array or null as appropriate — do not fabricate to fill it in.`;

  const raw = await generateGroundedAnswer(prompt);

  let parsed;
  try {
    parsed = extractJson(raw);
  } catch (err) {
    throw new Error(`Lab insights model returned unparsable output: ${err.message}`);
  }

  return {
    healthScore: Number.isFinite(parsed.healthScore) ? Math.max(0, Math.min(100, Math.round(parsed.healthScore))) : null,
    healthScoreNote: typeof parsed.healthScoreNote === 'string' ? parsed.healthScoreNote.trim() : '',
    series: Array.isArray(parsed.series)
      ? parsed.series
          .filter((s) => s && s.testName && Array.isArray(s.points) && s.points.length > 0)
          .map((s) => ({
            testName: String(s.testName).trim(),
            unit: typeof s.unit === 'string' ? s.unit.trim() : '',
            normalRange: typeof s.normalRange === 'string' ? s.normalRange.trim() : '',
            points: s.points
              .filter((p) => p && p.date && Number.isFinite(Number(p.value)))
              .map((p) => ({ date: String(p.date), value: Number(p.value) }))
              .sort((a, b) => new Date(a.date) - new Date(b.date)),
          }))
          .filter((s) => s.points.length > 0)
      : [],
    physicianSummary: Array.isArray(parsed.physicianSummary)
      ? parsed.physicianSummary
          .filter((item) => item && item.title && item.body)
          .map((item) => ({
            title: String(item.title).trim(),
            body: String(item.body).trim(),
            tone: ['good', 'watch', 'neutral'].includes(item.tone) ? item.tone : 'neutral',
          }))
      : [],
    followUps: Array.isArray(parsed.followUps)
      ? parsed.followUps
          .filter((f) => f && f.title)
          .map((f) => ({ title: String(f.title).trim(), reason: typeof f.reason === 'string' ? f.reason.trim() : '' }))
      : [],
  };
}
