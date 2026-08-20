// Gemini Vision OCR for report auto-fill. Transport, key rotation, and model
// fallback now all live in ./aiClient.js (the shared failover client used by
// every AI feature in this service) — this file just owns the extraction
// prompt and the response shaping specific to report fields.
import { runAI } from './aiClient.js';

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

The document may be printed/written in any language or script (e.g. Bengali, Hindi, Tamil, Telugu, Devanagari, Arabic, etc.). Regardless of the script/language, every text field you extract below MUST be transliterated/translated into English (Latin script) in your output — never return non-English/non-Latin script text. For example, a Bengali doctor name printed as "ডাঃ এস.কে. এম. জয়নাউল আবেদীন" must be returned as "Dr. S.K.M. Zainaul Abedin". Medicine names should use their standard English/Latin pharmaceutical spelling.

Extract the following fields:

1. title (string: a short descriptive title, e.g. "Diabetes Follow-up" or "CBC Lab Report")
2. doctor (string: doctor's name if legible)
3. hospital (string: hospital/clinic/lab name if legible)
4. reportDate (string: YYYY-MM-DD if a date is legible)
5. category (string: one of "Prescription", "Lab Report", "Imaging", "Vaccination", "Consultation" — always pick your best-guess closest match, this field should never be left blank)
6. diagnosis (string: what goes here depends on the category you picked above —
   - Prescription: the diagnosis/condition being treated
   - Lab Report: the test or panel name (e.g. "Complete Blood Count")
   - Imaging: the findings/impression (e.g. "No acute abnormality")
   - Vaccination: the vaccine name (e.g. "Influenza Vaccine")
   - Consultation: the reason for the visit
   Leave blank if not legible.)
7. medicines (string: what goes here also depends on category —
   - Prescription: medicines/dosages, comma-separated
   - Lab Report: key result values (e.g. "Hemoglobin 13.2 g/dL, WBC 7,200/µL")
   - Imaging: the body part / scan type (e.g. "MRI Lumbar Spine")
   - Vaccination: dose number / batch info (e.g. "Dose 2 of 2, Batch #A1234")
   - Consultation: leave blank, usually not applicable
   Leave blank if not legible.)
8. notes (string: plain-text transcription of all other clinically relevant text that IS legible — additional values, instructions, observations not captured above)

CRITICAL RULE: for fields 2, 3, 4, 6, 7, 8 — if the relevant handwriting or text is genuinely illegible, ambiguous, or absent, return an empty string "" (or null for reportDate) for that field. Do NOT guess, do NOT invent a plausible-sounding value, do NOT fill in what a typical prescription "probably" says. A blank field the patient can fill in themselves is far better than a confident-looking wrong answer on a medical document — getting a medicine name or dosage wrong could be dangerous. Only report what you can actually read.

Also return an "unclear" array listing exactly which of these field names (from: doctor, hospital, reportDate, diagnosis, medicines, notes) you left blank or are genuinely unsure about, even if you provided a low-confidence guess for it anyway. If everything was clearly legible, return an empty array.

Respond strictly in JSON format with exactly these keys, with all text fields in English only. Example:
{"title": "Diabetes Follow-up", "doctor": "Dr. Ananya Sharma", "hospital": "", "reportDate": "2026-08-09", "category": "Prescription", "diagnosis": "Type 2 Diabetes Mellitus", "medicines": "Metformin 500mg twice daily", "notes": "Fasting blood glucose 162 mg/dL, HbA1c 7.8%. BP 138/88.", "unclear": ["hospital"]}`;

  // Routed through the shared failover client: walks flash-lite -> flash ->
  // 3.1-flash-lite across all 4 keys, then OpenRouter. Note gemini-2.0-flash
  // was dropped from the ladder — it is retired (404) as of 2026-08-19.
  const res = await runAI({
    task: 'vision-ocr',
    input: promptText,
    file: { data: payload.data, mime: payload.mime },
    json: true,
    label: 'extract',
  });

  // Total exhaustion. Must be checked BEFORE JSON.parse — the degraded value
  // is a friendly sentence, not JSON, and would throw a confusing parse error.
  // The caller (routes/extract.js) already shows "fill the form manually".
  if (!res.ok) {
    const err = new Error('Report extraction unavailable: all AI providers exhausted');
    err.degraded = true;
    throw err;
  }

  const jsonText = res.text;

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
