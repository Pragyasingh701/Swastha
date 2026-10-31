import dotenv from 'dotenv';
import fs from 'fs';
// Was a byte-mirrored local copy (backend/services/aiClient.js) until this
// import — see backend/rag/config/aiClient.js's own header comment for why
// one shared module works now: this process already merges backend/ and
// backend/rag/ together (backend/app.js dynamically imports rag/app.js
// before the server starts listening), so importing the rag/ copy adds no
// new startup dependency — rag/config/env.js's validation was already a
// precondition for this process to boot at all.
import { runAI } from '../rag/config/aiClient.js';
import { downloadStoredFile } from '../config/supabaseStorage.js';

if (fs.existsSync('./backend/.env')) {
  dotenv.config({ path: './backend/.env' });
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
} else {
  dotenv.config();
}

/**
 * Helper to convert file path or relative URL to clean Base64 data and mime type
 */
async function fileToBase64Payload(fileInput) {
  if (!fileInput) return null;

  if (typeof fileInput === 'string' && fileInput.startsWith('data:') && fileInput.includes(';base64,')) {
    const parts = fileInput.split(';base64,');
    const mime = parts[0].replace('data:', '');
    const data = parts[1];
    return { data, mime, dataUrl: fileInput };
  }

  try {
    // Only a file in our own storage bucket can be read. The value used to be
    // a path taken from the request, which let a caller have arbitrary server
    // files read and sent to the AI provider; the route also checks that the
    // file belongs to the caller before it gets here.
    const stored = await downloadStoredFile(fileInput);
    if (!stored) return null;
    const base64Data = stored.buffer.toString('base64');
    return {
      data: base64Data,
      mime: stored.mime,
      dataUrl: `data:${stored.mime};base64,${base64Data}`,
    };
  } catch (err) {
    console.warn('File to Base64 conversion warning:', err.message);
  }

  return null;
}

/**
 * Vision AI Medical Certificate Engine.
 *
 * Routed through the shared failover client (backend/rag/config/aiClient.js,
 * same one the RAG sub-app uses): rotates all Gemini keys, then
 * flash-lite -> flash -> 3.1-flash-lite. The
 * previous inline implementation had a `let lastError` declared inside an
 * `if (geminiKey)` block but read outside it — every failure path threw a
 * ReferenceError instead of returning `{ error }`. Fixed as part of this
 * rewrite; runAI never throws for this task, so there's no equivalent trap
 * here to begin with. gemini-2.0-flash (the old second fallback model) is
 * also dropped — verified retired (404) as of 2026-08-19.
 */
async function parseCertificateWithGeminiAI(payload, doctorData = {}) {
  if (!payload) return null;

  const promptText = `Analyze this uploaded document image. Determine if it is an official Medical Registration Certificate or Medical Council License.
The document may be printed in any language or script (e.g. Bengali, Hindi, Tamil, Telugu, Devanagari, Arabic, etc.).
IMPORTANT: Regardless of the script/language the document is printed in, all extracted text fields below (doctorName, medicalCouncil, qualifications) MUST be transliterated/translated into English (Latin script). Never return non-English/non-Latin script text in the output — always give the standard English rendering of the name and council (e.g. a Bengali name printed as "ডাঃ অরুণ শর্মা" must be returned as "Dr. Arun Sharma").
Extract the following fields:
1. isMedicalCertificate (boolean: true if it is a medical registration certificate/license, false if it is a cat/pet photo, resume, ID card, invoice, or non-medical document)
2. regNumber (string: Medical registration number e.g. MCI-12345, 25007, or NMC/2024/98765 if present on the document, or null if no registration number exists)
3. doctorName (string: Doctor's name on certificate if present, transliterated/translated into English)
4. medicalCouncil (string: Issuing council name if present, transliterated/translated into English)
5. qualifications (array of strings: e.g. ["MBBS", "MD"], transliterated/translated into English)
6. expiryDate (string: YYYY-MM-DD format if date found, or null)
7. isExpired (boolean: true if validTill date is in the past)

Respond strictly in JSON format, with all text fields in English only. Example:
{"isMedicalCertificate": true, "regNumber": "NMC/25007", "doctorName": "Dr. Aarav Sharma", "medicalCouncil": "National Medical Commission", "qualifications": ["MBBS"], "expiryDate": null, "isExpired": false}`;

  const res = await runAI({
    task: 'vision-ocr',
    input: promptText,
    file: { data: payload.data, mime: payload.mime },
    json: true,
    label: 'certificate',
  });

  if (!res.ok) {
    // Every key/model/provider exhausted. processMedicalCertificate's caller
    // already turns this into a friendly validationError, never a raw 500.
    return { error: res.text };
  }

  try {
    const parsed = JSON.parse(res.text);
    return evaluateParsedCertificate(parsed, doctorData);
  } catch (err) {
    console.warn('Gemini Vision AI returned non-JSON extraction result:', err.message);
    return { error: 'Vision AI returned an unreadable response.' };
  }
}

// The model is asked for the expiry DATE and for a yes/no "isExpired". It cannot know today's date,
// so its yes/no is a guess; only the date it read off the page is used, and the comparison is
// made here. A missing or unreadable date means "no expiry shown", not "expired".
function readExpiry(value, today = new Date()) {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { expiryDate: null, isExpired: false };
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const real = date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
  if (!real) return { expiryDate: null, isExpired: false };
  // Valid through the printed date itself.
  return { expiryDate: text, isExpired: text < today.toISOString().slice(0, 10) };
}

// Does the number printed on the certificate match the one typed on the form? Both must carry a
// real number (at least 4 digits). Letters like "MCI/" or "NMC" are only a prefix and prove
// nothing alone, and a short fragment is not enough: it used to be, so a certificate showing
// just "MCI" or "123" matched almost any number. The digits must be the same, or one number must
// contain the other's digits whole (a form with just "98765" against "NMC/2024/98765").
function registrationNumbersMatch(formNumber, certificateNumber) {
  const formDigits = String(formNumber || '').replace(/\D/g, '');
  const certDigits = String(certificateNumber || '').replace(/\D/g, '');
  if (formDigits.length < 4 || certDigits.length < 4) return false;
  return certDigits === formDigits || certDigits.includes(formDigits) || formDigits.includes(certDigits);
}

/**
 * Evaluate Parsed Vision JSON Result against manually entered Form Registration Number.
 * What this decides is only whether the scan found what it should; it does not verify the doctor
 * (there is no check against the official register yet).
 */
function evaluateParsedCertificate(parsed, doctorData = {}, today = new Date()) {
  const formRegFull = (doctorData.regNumber || doctorData.licenseNumber || '').trim();
  const ocrRegFull = typeof parsed.regNumber === 'string' ? parsed.regNumber : '';

  const isMedicalCertificate = parsed.isMedicalCertificate === true;

  // MANDATORY PRIMARY CHECK: Registration Number must be present on certificate and match entered number
  const regPresent = ocrRegFull.replace(/[^A-Za-z0-9]/g, '').length >= 3;
  const regMatches = regPresent && registrationNumbersMatch(formRegFull, ocrRegFull);

  const { expiryDate, isExpired } = readExpiry(parsed.expiryDate, today);

  const isVerified = isMedicalCertificate && regMatches && !isExpired;

  let validationError = null;
  if (!isMedicalCertificate) {
    validationError = 'Uploaded document is NOT a Medical Registration Certificate. Please upload an official Medical Council Certificate.';
  } else if (!regPresent || !regMatches) {
    validationError = `Medical Registration Number (${formRegFull}) was NOT found on the uploaded certificate image.`;
  } else if (isExpired) {
    validationError = 'Uploaded Medical Certificate has expired. Please upload an active renewal certificate.';
  }

  return {
    success: isVerified,
    engine: 'Google Gemini Vision AI',
    isMedicalCertificate,
    validationError,
    // Only what was read from the certificate. A blank stays blank: it used to be filled in from
    // the form, or with "Doctor", "Medical Council" and "MBBS", which then looked like scanned fact.
    extractedData: {
      doctorName: parsed.doctorName || null,
      regNumber: parsed.regNumber || null,
      medicalCouncil: parsed.medicalCouncil || null,
      qualifications: Array.isArray(parsed.qualifications) ? parsed.qualifications : [],
      expiryDate,
      isExpired,
    },
    validation: {
      regNumberFound: regPresent,
      regNumberMatchesForm: regMatches,
      isExpired,
    },
  };
}

/**
 * Main API function to Process Medical Certificate File Upload via Gemini Vision AI
 * @param {string|Buffer} fileInput - Stored certificate URL (our storage bucket) or a data URL
 * @param {object} doctorData - Form details entered manually by doctor (e.g. regNumber, fullName, council)
 */
export async function processMedicalCertificate(fileInput, doctorData = {}) {
  if (!fileInput) {
    return {
      success: false,
      message: 'No certificate file provided.',
    };
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEYS) {
    return {
      success: false,
      engine: 'Gemini Vision AI',
      isMedicalCertificate: false,
      validationError: 'GEMINI_API_KEY is not configured in backend environment variables.',
    };
  }

  const payload = await fileToBase64Payload(fileInput);
  if (!payload) {
    return {
      success: false,
      message: 'Could not load certificate file for Vision AI scanning.',
    };
  }

  // 1. Process via Gemini Vision AI (shared failover client)
  const aiResult = await parseCertificateWithGeminiAI(payload, doctorData);
  if (aiResult && !aiResult.error) {
    return aiResult;
  }

  // 2. Fallback evaluation if Vision AI fails or rate limits
  return {
    success: false,
    engine: 'Vision AI Status Check',
    isMedicalCertificate: false,
    validationError: aiResult?.error
      ? `Vision AI extraction failed: ${aiResult.error}`
      : 'Vision AI service is currently busy or rate-limited. Please retry in a few seconds.',
  };
}

export const __testing = { evaluateParsedCertificate, readExpiry, registrationNumbersMatch };
