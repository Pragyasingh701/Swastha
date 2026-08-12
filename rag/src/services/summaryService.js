import { generateGroundedAnswer } from '../config/openrouter.js';

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

  const prompt = `You are a medical records assistant. Write a short, clear, plain-language summary of the following health record for the patient to read. Cover everything present in the record below — diagnosis/findings, medicines or results, and any relevant notes — in 3-5 sentences. Do not invent or add anything not stated in the record. Do not give medical advice beyond what's written. Write it as flowing prose, not a bulleted restatement of the fields.

Record:
${lines.join('\n')}

Summary:`;

  const summary = await generateGroundedAnswer(prompt);
  return summary;
}
