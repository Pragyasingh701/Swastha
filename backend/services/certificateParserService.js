import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

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

  if (typeof fileInput === 'string' && fileInput.startsWith('data:image/')) {
    const parts = fileInput.split(';base64,');
    const mime = parts[0].replace('data:', '');
    const data = parts[1];
    return { data, mime, dataUrl: fileInput };
  }

  try {
    let filePath = fileInput;
    if (typeof fileInput === 'string' && fileInput.startsWith('/uploads/')) {
      filePath = path.join(process.cwd(), fileInput);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(process.cwd(), 'backend', fileInput);
      }
    }

    if (fs.existsSync(filePath)) {
      const fileBuffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
      const base64Data = fileBuffer.toString('base64');
      return {
        data: base64Data,
        mime,
        dataUrl: `data:${mime};base64,${base64Data}`,
      };
    }
  } catch (err) {
    console.warn('File to Base64 conversion warning:', err.message);
  }

  return null;
}

/**
 * Vision AI Medical Certificate Engine (Google Gemini 2.0 Flash AI - 100% Free API)
 */
async function parseCertificateWithGeminiAI(payload, doctorData = {}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || !payload) return null;

  const promptText = `Analyze this uploaded document image. Determine if it is an official Medical Registration Certificate or Medical Council License.
Extract the following fields:
1. isMedicalCertificate (boolean: true if it is a medical registration certificate/license, false if it is a cat/pet photo, resume, ID card, invoice, or non-medical document)
2. regNumber (string: Medical registration number e.g. MCI-12345, 25007, or NMC/2024/98765 if present on the document, or null if no registration number exists)
3. doctorName (string: Doctor's name on certificate if present)
4. medicalCouncil (string: Issuing council name if present)
5. qualifications (array of strings: e.g. ["MBBS", "MD"])
6. expiryDate (string: YYYY-MM-DD format if date found, or null)
7. isExpired (boolean: true if validTill date is in the past)

Respond strictly in JSON format. Example:
{"isMedicalCertificate": true, "regNumber": "NMC/25007", "doctorName": "Dr. Aarav Sharma", "medicalCouncil": "National Medical Commission", "qualifications": ["MBBS"], "expiryDate": null, "isExpired": false}`;

  if (geminiKey) {
    const modelsToTry = ['gemini-flash-latest', 'gemini-2.0-flash'];
    let lastError = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { inlineData: { mimeType: payload.mime, data: payload.data } },
                    { text: promptText },
                  ],
                },
              ],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          });

          const data = await response.json();

          if (response.status === 429) {
            lastError = data.error?.message || 'Quota limit exceeded for Gemini API Key.';
            console.warn(`⏳ Gemini Vision AI Rate Limit (${modelName}):`, lastError);
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }

          if (response.ok) {
            const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (jsonText) {
              const parsed = JSON.parse(jsonText);
              return evaluateParsedCertificate(parsed, doctorData);
            }
          } else if (data.error) {
            lastError = data.error.message;
          }
        } catch (gErr) {
          lastError = gErr.message;
          console.warn('Gemini Vision AI notice:', gErr.message);
        }
      }
    }
  }

  return null;
}

/**
 * Evaluate Parsed Vision JSON Result against manually entered Form Registration Number
 */
function evaluateParsedCertificate(parsed, doctorData = {}) {
  const formRegFull = (doctorData.regNumber || doctorData.licenseNumber || '').trim();
  const formRegClean = formRegFull.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const formRegDigits = formRegFull.replace(/[^0-9]/g, '');

  const ocrRegFull = (parsed.regNumber || '').toUpperCase();
  const ocrRegClean = ocrRegFull.replace(/[^A-Z0-9]/g, '');
  const ocrRegDigits = ocrRegFull.replace(/[^0-9]/g, '');

  const isMedicalCertificate = !!parsed.isMedicalCertificate;

  // MANDATORY PRIMARY CHECK: Registration Number must be present on certificate and match entered number
  const regPresent = !!(parsed.regNumber && ocrRegClean.length >= 3);
  const regMatches = regPresent && (!formRegClean || 
                     ocrRegClean.includes(formRegClean) || 
                     formRegClean.includes(ocrRegClean) || 
                     (formRegDigits.length >= 3 && ocrRegDigits.includes(formRegDigits)));

  const isVerified = isMedicalCertificate && regMatches && !parsed.isExpired;

  let validationError = null;
  if (!isMedicalCertificate) {
    validationError = 'Uploaded document is NOT a Medical Registration Certificate. Please upload an official Medical Council Certificate.';
  } else if (!regPresent || !regMatches) {
    validationError = `Medical Registration Number (${formRegFull}) was NOT found on the uploaded certificate image.`;
  } else if (parsed.isExpired) {
    validationError = 'Uploaded Medical Certificate has expired. Please upload an active renewal certificate.';
  }

  return {
    success: isVerified,
    engine: 'Google Gemini 2.0 Flash Vision AI',
    isMedicalCertificate,
    validationError,
    extractedData: {
      doctorName: parsed.doctorName || doctorData.fullName || 'Doctor',
      regNumber: parsed.regNumber || (regMatches ? formRegFull : 'N/A'),
      medicalCouncil: parsed.medicalCouncil || doctorData.council || 'Medical Council',
      qualifications: Array.isArray(parsed.qualifications) && parsed.qualifications.length > 0 ? parsed.qualifications : [doctorData.degree || 'MBBS'],
      expiryDate: parsed.expiryDate || null,
      isExpired: !!parsed.isExpired,
    },
    validation: {
      regNumberFound: regPresent,
      regNumberMatchesForm: regMatches,
      isExpired: !!parsed.isExpired,
    },
  };
}

/**
 * Main API function to Process Medical Certificate File Upload via Gemini Vision AI
 * @param {string|Buffer} fileInput - Image file path, data URL, or relative upload URL
 * @param {object} doctorData - Form details entered manually by doctor (e.g. regNumber, fullName, council)
 */
export async function processMedicalCertificate(fileInput, doctorData = {}) {
  if (!fileInput) {
    return {
      success: false,
      message: 'No certificate file provided.',
    };
  }

  if (!process.env.GEMINI_API_KEY) {
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

  // 1. Process via Gemini 2.0 Flash Vision AI
  const aiResult = await parseCertificateWithGeminiAI(payload, doctorData);
  if (aiResult) {
    return aiResult;
  }

  // 2. Fallback evaluation if Vision AI fails or rate limits
  return {
    success: false,
    engine: 'Vision AI Status Check',
    isMedicalCertificate: false,
    validationError: 'Vision AI service is currently busy or rate-limited. Please retry in a few seconds.',
  };
}
