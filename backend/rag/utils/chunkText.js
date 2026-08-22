// Chunking tuned for medical report notes: short manual entries should stay
// as a single chunk (no point splitting "BP 120/80, prescribed amlodipine"),
// while long OCR text needs splitting so each chunk stays well within the
// embedding model's input limits and stays topically coherent for retrieval.

export const MAX_CHUNK_CHARS = 1200; // ~250-300 tokens, comfortably small for precise retrieval
export const CHUNK_OVERLAP_CHARS = 150; // preserves context across a chunk boundary
const MIN_CHUNK_CHARS = 20; // drop near-empty trailing fragments (e.g. stray OCR noise)

/**
 * Split `normalized` (no length limit) into chunks of at most
 * MAX_CHUNK_CHARS, each chunk overlapping the previous by
 * CHUNK_OVERLAP_CHARS characters. Pure character-window split — used as the
 * fallback when a sentence/paragraph unit is itself too long to place
 * whole.
 */
function hardSplit(str) {
  const out = [];
  const step = MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS;
  for (let i = 0; i < str.length; i += step) {
    out.push(str.slice(i, i + MAX_CHUNK_CHARS));
    if (i + MAX_CHUNK_CHARS >= str.length) break;
  }
  return out;
}

/**
 * Split `notes` into an ordered array of chunk strings.
 *
 * Strategy:
 *  1. Normalize whitespace (OCR output is often riddled with irregular
 *     line breaks/spacing).
 *  2. If the whole text already fits in one chunk, return it as-is —
 *     this keeps short manual entries as a single, clean chunk.
 *  3. Otherwise split into sentence/paragraph units, then pack greedily
 *     into ~MAX_CHUNK_CHARS windows, carrying a small overlap from the
 *     tail of each chunk into the next so context isn't lost at a
 *     boundary. Units longer than MAX_CHUNK_CHARS on their own (e.g. no
 *     punctuation at all) are hard-split by character window so nothing
 *     is ever silently dropped.
 */
export function chunkText(notes) {
  if (!notes || typeof notes !== 'string') return [];

  const normalized = notes.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

  if (!normalized) return [];

  if (normalized.length <= MAX_CHUNK_CHARS) {
    return [normalized];
  }

  const units = normalized
    .split(/\n{2,}/)
    .flatMap((para) => para.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map((u) => u.trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const unit of units) {
    if (unit.length > MAX_CHUNK_CHARS) {
      // Flush whatever we were building, emit the oversized unit as its
      // own hard-split chunks, then continue packing fresh.
      flush();
      chunks.push(...hardSplit(unit));
      continue;
    }

    const candidate = current ? `${current} ${unit}` : unit;

    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }

    // Adding `unit` would overflow — close out the current chunk and
    // start the next one with a bit of overlap plus this unit.
    flush();
    const prevChunk = chunks[chunks.length - 1] || '';
    const overlap = prevChunk.slice(-CHUNK_OVERLAP_CHARS);
    current = overlap ? `${overlap} ${unit}` : unit;
  }

  flush();

  return chunks.filter((c) => c.length >= MIN_CHUNK_CHARS);
}
