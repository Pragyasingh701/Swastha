// Plain REST calls to the Gemini API — no SDK, keeps this service's
// dependency footprint tiny. Uses Node's built-in fetch (Node 18+).
//
// Embeddings only. Grounded answer generation lives in openrouter.js —
// Gemini's chat models kept 404ing as "no longer available to new users"
// for this key, so answer generation was moved to OpenRouter (routes to
// a free model) while embeddings (a different, non-chat endpoint) stayed
// here since gemini-embedding-001 has no OpenRouter equivalent.
import { GEMINI_API_KEY } from './env.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768;
// Same alias as backend/services/certificateParserService.js uses — kept in
// sync manually since this is a separate service on purpose (see README).
const VISION_MODEL = 'gemini-flash-latest';

async function callGemini(path, body) {
  const url = `${API_BASE}/${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure (DNS, connection reset, etc.)
    throw new Error(`Gemini API request to ${path} failed (network error): ${err.message}`);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Gemini API returned non-JSON response from ${path}: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const message = json?.error?.message || res.statusText || 'unknown error';
    throw new Error(`Gemini API error from ${path} (HTTP ${res.status}): ${message}`);
  }

  return json;
}

/**
 * Embed a single piece of text with gemini-embedding-001, truncated to
 * EMBEDDING_DIMENSIONS via outputDimensionality (MRL truncation — loses
 * very little quality vs the native 3072-dim output).
 *
 * Throws on any failure or dimension mismatch — callers must not swallow
 * this, a bad embedding must never be silently stored or padded.
 */
export async function embedText(text, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) {
  if (!text || !text.trim()) {
    throw new Error('embedText: refusing to embed empty/blank text');
  }

  const json = await callGemini(`${EMBEDDING_MODEL}:embedContent`, {
    content: { parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
    taskType,
  });

  const embedding = json?.embedding?.values;

  if (!Array.isArray(embedding)) {
    throw new Error(
      'Gemini embedContent returned no embedding values (unexpected response shape)'
    );
  }
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    // Hard fail rather than pad/truncate ourselves — a silent dimension
    // mismatch here would corrupt similarity search results.
    throw new Error(
      `Gemini returned a ${embedding.length}-dim embedding, expected ${EMBEDDING_DIMENSIONS}. ` +
        'Refusing to store — check outputDimensionality support for gemini-embedding-001.'
    );
  }

  return embedding;
}

/**
 * Embed many chunks. Sequential by default to stay well within free-tier
 * rate limits; call sites can parallelize later if needed.
 */
export async function embedTexts(texts, opts) {
  const results = [];
  for (const text of texts) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await embedText(text, opts));
  }
  return results;
}

// Fields the model is allowed to report as "unclear" — matches the keys
// returned in `fields` below (minus `category`, which always gets a
// best-guess default rather than being left blank).
const EXTRACTABLE_FIELD_KEYS = ['title', 'doctor', 'hospital', 'reportDate', 'diagnosis', 'medicines', 'notes'];

/**
 * Extract structured medical report fields from an uploaded image/PDF using
 * Gemini Vision — same pattern as backend's certificateParserService.js,
 * but for report content (title/doctor/hospital/diagnosis/medicines/notes)
 * instead of certificate verification.
 *
 * Handwritten prescriptions are the primary real-world case this is used
 * for (patients frequently have no printed/soft copy). No vision model
 * reliably reads bad handwriting, so this is intentionally conservative:
 * the prompt instructs Gemini to leave a field blank rather than guess
 * when it's genuinely illegible, and `unclear` reports back which fields
 * it couldn't read so the UI can flag them for the patient to fill in
 * manually — or, if the patient doesn't know either, flag them for a
 * doctor to check the original file later rather than silently guessing.
 *
 * @param {{ data: string, mime: string }} payload - base64 file data + mime type
 * @returns {{ fields: object, unclear: string[] }} extracted fields plus
 *   the list of field keys Gemini flagged as illegible/uncertain. Caller
 *   must still treat every field as possibly wrong, even ones not flagged.
 */
export async function extractReportFromImage(payload) {
  if (!payload?.data || !payload?.mime) {
    throw new Error('extractReportFromImage: payload with data and mime is required');
  }

  const promptText = `Analyze this uploaded medical document image (prescription, lab report, scan, or similar). This is very often a HANDWRITTEN doctor's prescription — handwriting can be genuinely illegible, and that is expected and fine.

Extract the following fields:

1. title (string: a short descriptive title, e.g. "Diabetes Follow-up" or "CBC Lab Report")
2. doctor (string: doctor's name if legible)
3. hospital (string: hospital/clinic/lab name if legible)
4. reportDate (string: YYYY-MM-DD if a date is legible)
5. category (string: one of "Prescription", "Lab Report", "Imaging", "Vaccination", "Consultation" — always pick your best-guess closest match, this field should never be left blank)
6. diagnosis (string: diagnosis/findings if legible)
7. medicines (string: medicines/dosages if legible, comma-separated)
8. notes (string: plain-text transcription of all other clinically relevant text that IS legible — test values, instructions, observations)

CRITICAL RULE: for fields 2, 3, 4, 6, 7, 8 — if the relevant handwriting or text is genuinely illegible, ambiguous, or absent, return an empty string "" (or null for reportDate) for that field. Do NOT guess, do NOT invent a plausible-sounding value, do NOT fill in what a typical prescription "probably" says. A blank field the patient can fill in themselves is far better than a confident-looking wrong answer on a medical document — getting a medicine name or dosage wrong could be dangerous. Only report what you can actually read.

Also return an "unclear" array listing exactly which of these field names (from: doctor, hospital, reportDate, diagnosis, medicines, notes) you left blank or are genuinely unsure about, even if you provided a low-confidence guess for it anyway. If everything was clearly legible, return an empty array.

Respond strictly in JSON format with exactly these keys. Example:
{"title": "Diabetes Follow-up", "doctor": "Dr. Ananya Sharma", "hospital": "", "reportDate": "2026-08-09", "category": "Prescription", "diagnosis": "Type 2 Diabetes Mellitus", "medicines": "Metformin 500mg twice daily", "notes": "Fasting blood glucose 162 mg/dL, HbA1c 7.8%. BP 138/88.", "unclear": ["hospital"]}`;

  const json = await callGemini(`${VISION_MODEL}:generateContent`, {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: payload.mime, data: payload.data } },
          { text: promptText },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json' },
  });

  const candidate = json?.candidates?.[0];
  const jsonText = candidate?.content?.parts?.map((p) => p.text).join('') ?? '';

  if (!jsonText.trim()) {
    const finishReason = candidate?.finishReason;
    throw new Error(
      `Gemini Vision returned no text (finishReason: ${finishReason || 'unknown'})`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Gemini Vision returned non-JSON extraction result: ${jsonText.slice(0, 300)}`);
  }

  const fields = {
    title: parsed.title || '',
    doctor: parsed.doctor || '',
    hospital: parsed.hospital || '',
    reportDate: parsed.reportDate || null,
    category: parsed.category || 'Consultation',
    diagnosis: parsed.diagnosis || '',
    medicines: parsed.medicines || '',
    notes: parsed.notes || '',
  };

  // Trust the model's own "unclear" list, but also independently flag any
  // extractable field that came back empty — defends against the model
  // leaving a field blank without remembering to list it as unclear.
  const modelFlagged = Array.isArray(parsed.unclear)
    ? parsed.unclear.filter((key) => EXTRACTABLE_FIELD_KEYS.includes(key))
    : [];
  const emptyFields = EXTRACTABLE_FIELD_KEYS.filter((key) => !fields[key]);
  const unclear = [...new Set([...modelFlagged, ...emptyFields])];

  return { fields, unclear };
}

export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, VISION_MODEL };
