// Routed through the shared failover client: Gemini (4 keys) -> OpenRouter.
// Throws when every provider fails or the reply is empty, so no error text is ever stored as a summary.
import { runAI } from '../config/aiClient.js';
import { UNTRUSTED_DATA_RULES, wrapUntrusted, sanitizeModelText } from '../utils/untrustedData.js';

/**
 * Generate a plain-language AI summary of a full medical report, covering
 * every field the patient entered/AI extracted — not just a couple of
 * fields. Called once at save time (see rag/src/routes/summarize.js,
 * triggered from backend/routes/reports.js right after create/update) so
 * the summary is already sitting in the database by the time anyone clicks
 * "AI Summary" — no generation delay on click.
 *
 * @param {object} report - { title, doctor, hospital, category, reportDate,
 *   diagnosis, medicines, notes }
 * @returns {string} the summary text
 */
export async function summarizeReport(report) {
  const {
    title, doctor, hospital, category, reportDate, diagnosis, medicines, notes,
  } = report || {};

  const lines = [];
  const appendField = (label, value) => {
    if (value && String(value).trim()) lines.push(`${label}: ${String(value).trim()}`);
  };

  appendField('Title', title);
  appendField('Category', category);
  appendField('Date', reportDate);
  appendField('Doctor', doctor);
  appendField('Hospital', hospital);
  appendField('Diagnosis / Test / Findings', diagnosis);
  appendField('Medicines / Results / Details', medicines);
  appendField('Notes', notes);

  if (lines.length === 0) {
    throw new Error('summarizeReport: report has no content to summarize');
  }

  const recordText = lines.join('\n');
  const prompt = `You are a medical records assistant. Write a short, clear, plain-language summary of the health record below for the patient to read. Cover everything present in the record — diagnosis/findings, medicines or results, and any relevant notes — in 3-5 sentences. Do not invent or add anything not stated in the record. Do not give medical advice beyond what's written. Write it as flowing prose, not a bulleted restatement of the fields.

${UNTRUSTED_DATA_RULES}

${wrapUntrusted('record', recordText)}

Summary:`;

  const res = await runAI({ task: 'generation', input: prompt, label: 'summary' });
  // When every provider failed, `text` is only a friendly "please try again" sentence. That is
  // an error, not a summary: it must never be stored as one (it used to be saved on the report,
  // and a forced Regenerate could overwrite a good summary with it). The caller treats a throw
  // as "no summary this time" and leaves the report as it was.
  if (!res.ok) {
    throw new Error(`summarizeReport: AI summary unavailable (${res.error_code || 'unknown'})`);
  }
  const summary = sanitizeModelText(res.text, 1500);
  if (!summary) {
    throw new Error('summarizeReport: the model returned no usable summary');
  }
  return summary;
}
