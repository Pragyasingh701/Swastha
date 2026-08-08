const ALLOWED_CATEGORIES = ['Prescription', 'Lab Report', 'Imaging', 'Vaccination', 'Consultation'];
const MAX_LENGTHS = {
  title: 200,
  doctor: 120,
  hospital: 120,
  diagnosis: 500,
  medicines: 1000,
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

function hasUnsupportedCharacters(value) {
  return /[<>]/.test(value);
}

export function validateTimelineReportPayload(payload) {
  const title = normalizeText(payload?.title);
  const doctor = normalizeText(payload?.doctor);
  const hospital = normalizeText(payload?.hospital);
  const reportDate = normalizeText(payload?.reportDate || payload?.date || '');
  const category = normalizeText(payload?.category);
  const diagnosis = normalizeText(payload?.diagnosis);
  const medicines = normalizeText(payload?.medicines);
  const notes = normalizeText(payload?.notes || '');

  if (!title || !doctor || !hospital || !diagnosis || !medicines) {
    return {
      valid: false,
      message: 'Title, doctor, hospital, diagnosis, and medicines are required.',
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

  if (hasUnsupportedCharacters(title) || hasUnsupportedCharacters(doctor) || hasUnsupportedCharacters(hospital) || hasUnsupportedCharacters(diagnosis) || hasUnsupportedCharacters(medicines) || hasUnsupportedCharacters(notes)) {
    return {
      valid: false,
      message: 'Input contains unsupported characters.',
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
