// A report's `notes` column holds two things in one string: what the patient or
// doctor wrote, and (after "Regenerate" or the first view) the AI-written summary,
// appended under an "[AI Analysis]" marker (see db/reports.js). The summary is the
// app's own output, not part of the record, so it must never be handed back to the
// AI as if it were record text, or an earlier mistake becomes a "fact" in the next answer.
const AI_ANALYSIS_MARKER = '\n\n[AI Analysis]\n';

export function stripAiAnalysis(rawNotes) {
  const raw = typeof rawNotes === 'string' ? rawNotes.trim() : '';
  if (!raw) return '';
  const at = raw.indexOf(AI_ANALYSIS_MARKER);
  if (at !== -1) return raw.slice(0, at).trim();
  // A report whose only content is the summary has no text before the marker.
  return raw.startsWith('[AI Analysis]\n') ? '' : raw;
}

export function splitStoredNotes(rawNotes) {
  const raw = typeof rawNotes === 'string' ? rawNotes.trim() : '';
  if (!raw) return { notes: '', analysis: '' };
  const at = raw.indexOf(AI_ANALYSIS_MARKER);
  if (at === -1) {
    return raw.startsWith('[AI Analysis]\n')
      ? { notes: '', analysis: raw.slice('[AI Analysis]\n'.length).trim() }
      : { notes: raw, analysis: '' };
  }
  return { notes: raw.slice(0, at).trim(), analysis: raw.slice(at + AI_ANALYSIS_MARKER.length).trim() };
}
