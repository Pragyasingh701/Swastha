// Routed through the shared failover client: Gemini (4 keys) -> OpenRouter.
import { runAI } from '../config/aiClient.js';

// Doctor-facing patient summary: unlike summaryService.js (one report) or
// labInsightsService.js (lab reports only, chart-shaped output), this
// covers a patient's FULL timeline across every category and produces a
// short clinical-style paragraph a doctor can read before a visit.

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
 * @returns {string} the summary text
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

Write a concise clinical summary (4-7 sentences) for the doctor covering: the patient's overall condition/history, notable diagnoses or findings, current or recent medications, and anything trending or recurring across records (e.g. a repeated diagnosis, a lab value mentioned more than once, a recent change in treatment). Only use what is explicitly stated in the records above — never invent values, diagnoses, or trends not present in the text. If the records don't support a conclusion, don't state one. Write it as flowing clinical prose, not a bulleted restatement of the fields.

Summary:`;

  const res = await runAI({ task: 'generation', input: prompt, label: 'patient-summary' });

  // Same reasoning as labInsightsService.js: check `ok` before trusting
  // `text` as real output — on total provider exhaustion `text` is just
  // the friendly fallback sentence, not a summary, and storing/serving
  // that as if it were one would misrepresent the patient's record.
  if (!res.ok) {
    throw new Error(`Patient summary generation unavailable: ${res.error_code}`);
  }

  return res.text;
}
