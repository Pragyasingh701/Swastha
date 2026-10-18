// Pulls the JSON object out of a model's reply. Chat models routinely wrap JSON in
// ```json fences, or add a sentence before or after it, despite being asked not to.
// Throws when there is no object in the text, or it does not parse.
export function extractJson(text) {
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
