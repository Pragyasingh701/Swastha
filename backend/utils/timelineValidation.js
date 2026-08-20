const ALLOWED_CATEGORIES = ['Prescription', 'Lab Report', 'Imaging', 'Vaccination', 'Consultation'];
const MAX_LENGTHS = {
  title: 200,
  doctor: 120,
  hospital: 120,
  diagnosis: 500,
  // Raised from 1000: rag/src/config/gemini.js now extracts one full,
  // detailed line per medicine (name, dosage, frequency, duration, route)
  // instead of a terse comma list — a prescription with 8-10 medicines can
  // easily clear 1000 chars, and the old limit made the save silently fail
  // for exactly the kind of long AI-extracted prescription this field
  // exists for.
  medicines: 4000,
  notes: 5000,
};

function isValidDateValue(value) {
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return normalized <= today;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Previously this field was rejected outright ("Input contains unsupported
// characters.") if it contained a literal < or >. That's overly broad for
// medical text: legitimate clinical notation routinely uses < and > for
// comparisons — "BP < 140/90", "temp > 101°F", lab reference ranges like
// "WBC > 11,000/µL" — all of which the AI extraction prompt in
// rag/src/config/gemini.js explicitly asks for (vitals, lab values,
// reference ranges). Rejecting the whole save on these characters silently
// blocked normal AI-extracted or manually-typed prescriptions/lab reports.
//
// Not HTML-escaping instead of rejecting: the frontend renders all of this
// as plain React text (no dangerouslySetInnerHTML anywhere in the app), so
// React already escapes on render and there's no XSS gap to close here.
// Escaping at write time was tried and reverted — a saved report gets
// loaded back into the edit form and resubmitted on every edit, so
// "&lt;" already in a field would become "&amp;lt;" on the next save,
// compounding indefinitely. Simply allowing the characters through
// unmodified is both simpler and correct given React's own escaping.

export function validateTimelineReportPayload(payload) {
  const title = normalizeText(payload?.title);
  const doctor = normalizeText(payload?.doctor);
  const hospital = normalizeText(payload?.hospital);
  const reportDate = normalizeText(payload?.reportDate || payload?.date || '');
  const category = normalizeText(payload?.category);
  const diagnosis = normalizeText(payload?.diagnosis);
  const medicines = normalizeText(payload?.medicines);
  const notes = normalizeText(payload?.notes || '');

  // Only title/date/category are hard requirements. Doctor, hospital,
  // diagnosis, and medicines are allowed blank — the AI-extraction upload
  // flow (see rag/src/config/gemini.js extractReportFromImage) deliberately
  // leaves a field empty rather than guess when handwriting on a scanned
  // prescription is illegible, and the patient reviewing it may not know
  // the answer either. A blank field a clinician can check against the
  // original document is safer than a forced placeholder value.
  if (!title) {
    return {
      valid: false,
      message: 'Title is required.',
    };
  }

  if (!reportDate) {
    return {
      valid: false,
      message: 'Report date is required.',
    };
  }

  if (!isValidDateValue(reportDate)) {
    return {
      valid: false,
      message: 'Report date must be a valid date that is not in the future.',
    };
  }

  if (!category || !ALLOWED_CATEGORIES.includes(category)) {
    return {
      valid: false,
      message: `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`,
    };
  }

  if (title.length > MAX_LENGTHS.title) {
    return {
      valid: false,
      message: 'Title is too long.',
    };
  }

  if (doctor.length > MAX_LENGTHS.doctor) {
    return {
      valid: false,
      message: 'Doctor name is too long.',
    };
  }

  if (hospital.length > MAX_LENGTHS.hospital) {
    return {
      valid: false,
      message: 'Hospital name is too long.',
    };
  }

  if (diagnosis.length > MAX_LENGTHS.diagnosis) {
    return {
      valid: false,
      message: 'Diagnosis is too long.',
    };
  }

  if (medicines.length > MAX_LENGTHS.medicines) {
    return {
      valid: false,
      message: 'Medicines field is too long.',
    };
  }

  if (notes.length > MAX_LENGTHS.notes) {
    return {
      valid: false,
      message: 'Notes are too long.',
    };
  }

  return {
    valid: true,
    sanitized: {
      title,
      doctor,
      hospital,
      reportDate,
      category,
      diagnosis,
      medicines,
      notes,
    },
  };
}
