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

/**
 * Extract structured medical report fields from an uploaded image/PDF using
 * Gemini Vision — same pattern as backend's certificateParserService.js,
 * but for report content (title/doctor/hospital/diagnosis/medicines/notes)
 * instead of certificate verification.
 *
 * @param {{ data: string, mime: string }} payload - base64 file data + mime type
 * @returns {object} extracted fields — caller must treat every field as
 *   possibly empty/wrong and let the user review before saving.
 */
export async function extractReportFromImage(payload) {
  if (!payload?.data || !payload?.mime) {
    throw new Error('extractReportFromImage: payload with data and mime is required');
  }

  const promptText = `Analyze this uploaded medical document image (prescription, lab report, scan, or similar). Extract the following fields as best you can from what's visible:

1. title (string: a short descriptive title, e.g. "Diabetes Follow-up" or "CBC Lab Report")
2. doctor (string: doctor's name if present, else "")
3. hospital (string: hospital/clinic/lab name if present, else "")
4. reportDate (string: YYYY-MM-DD if a date is visible, else null)
5. category (string: one of "Prescription", "Lab Report", "Imaging", "Vaccination", "Consultation" — pick the closest match)
6. diagnosis (string: diagnosis/findings mentioned, else "")
7. medicines (string: medicines/dosages mentioned, comma-separated, else "")
8. notes (string: a plain-text transcription of all other clinically relevant text on the document — test values, instructions, observations. This is the most important field, used for search later, so be thorough.)

Respond strictly in JSON format with exactly these keys. Example:
{"title": "Diabetes Follow-up", "doctor": "Dr. Ananya Sharma", "hospital": "Apollo Hospitals", "reportDate": "2026-08-09", "category": "Prescription", "diagnosis": "Type 2 Diabetes Mellitus", "medicines": "Metformin 500mg twice daily", "notes": "Fasting blood glucose 162 mg/dL, HbA1c 7.8%. BP 138/88. Advised low-carb diet."}`;

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

  return {
    title: parsed.title || '',
    doctor: parsed.doctor || '',
    hospital: parsed.hospital || '',
    reportDate: parsed.reportDate || null,
    category: parsed.category || 'Consultation',
    diagnosis: parsed.diagnosis || '',
    medicines: parsed.medicines || '',
    notes: parsed.notes || '',
  };
}

export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, VISION_MODEL };
