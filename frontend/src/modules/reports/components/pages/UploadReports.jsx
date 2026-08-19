import React, { useState } from "react";
import {
  X,
  UploadCloud,
  FileText,
  Calendar,
  User,
  Building2,
  Pill,
  FileHeart,
  Sparkles,
  Loader2,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { extractReportFromFile } from "../../../../api/search";

// PDFs and common image formats can be sent to the RAG extraction endpoint.
const EXTRACTABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function isExtractableFile(file) {
  if (!file) return false;

  if (EXTRACTABLE_TYPES.includes(file.type)) return true;

  const fileName = (file.name || "").toLowerCase();
  return [".pdf", ".png", ".jpg", ".jpeg", ".webp"].some((ext) => fileName.endsWith(ext));
}

// event.reportDate from Timeline is an ISO timestamp (e.g.
// "2026-08-10T00:00:00+00:00") — the date <input> needs a bare YYYY-MM-DD.
function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// Diagnosis/Medicines are stored under the same column names for every
// category (no schema change), but what they actually MEAN differs a lot
// by category — a lab report's "diagnosis" is really a test/panel name,
// a vaccination's "medicines" is really a dose/batch number, etc. This
// only changes the label/placeholder/visibility shown to the user; the
// underlying formData keys and backend columns stay diagnosis/medicines.
const CATEGORY_FIELD_CONFIG = {
  Prescription: {
    diagnosis: { label: "Diagnosis", placeholder: "e.g. Type 2 Diabetes Mellitus" },
    medicines: { label: "Medicines", placeholder: "e.g. Metformin 500mg twice daily" },
  },
  "Lab Report": {
    diagnosis: { label: "Test / Panel Name", placeholder: "e.g. Complete Blood Count (CBC)" },
    medicines: { label: "Key Results / Values", placeholder: "e.g. Hemoglobin 13.2 g/dL, WBC 7,200/µL" },
  },
  Imaging: {
    diagnosis: { label: "Findings", placeholder: "e.g. No acute abnormality, mild disc bulge at L4-L5" },
    medicines: { label: "Body Part / Scan Type", placeholder: "e.g. MRI Lumbar Spine" },
  },
  Vaccination: {
    diagnosis: { label: "Vaccine Name", placeholder: "e.g. Influenza (Flu) Vaccine" },
    medicines: { label: "Dose / Batch Info", placeholder: "e.g. Dose 2 of 2, Batch #A1234" },
  },
  Consultation: {
    diagnosis: { label: "Reason for Visit", placeholder: "e.g. Routine check-up, follow-up on BP" },
    medicines: null, // often not applicable for a plain consultation — field is hidden
  },
};

function getCategoryFieldConfig(category) {
  return CATEGORY_FIELD_CONFIG[category] || CATEGORY_FIELD_CONFIG.Prescription;
}

function emptyFormData() {
  return {
    title: "",
    doctor: "",
    hospital: "",
    date: "",
    diagnosis: "",
    medicines: "",
    notes: "",
    analysis: "",
    category: "Prescription",
    file: null,
    fileUrl: null,
  };
}

// Pre-fills the form from an existing timeline event when editing, instead
// of starting blank.
function formDataFromEvent(event) {
  if (!event) return emptyFormData();
  return {
    title: event.title || "",
    doctor: event.doctor || "",
    hospital: event.hospital || "",
    date: toDateInputValue(event.reportDate),
    diagnosis: event.diagnosis || "",
    medicines: event.medicines || "",
    notes: event.notes || "",
    analysis: event.analysis || "",
    category: event.category || "Prescription",
    file: null,
    fileUrl: event.fileUrl || null,
  };
}

export default function UploadReports({ onClose, onSubmit, token, initialEvent }) {
  const isEditing = Boolean(initialEvent);
  const [hasPrescription, setHasPrescription] = useState(true);
  // Editing an existing report goes straight to Manual Entry — there's no
  // new file to upload/extract from in that flow, just the saved fields.
  const [activeTab, setActiveTab] = useState(isEditing ? "manual" : "upload");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extracted, setExtracted] = useState(false);
  // Field keys AI extraction couldn't confidently read (e.g. illegible
  // handwriting) — highlighted in the form so the patient knows to fill
  // them in if they know the answer, or leave blank for a doctor to check
  // the original document later. Maps rag's field names (reportDate) to
  // this form's field names (date) where they differ.
  const [unclearFields, setUnclearFields] = useState(
    () => new Set(isEditing ? initialEvent.unclearFields || [] : [])
  );

  const [formData, setFormData] = useState(() => formDataFromEvent(initialEvent));

  // Field labels/placeholders/visibility for the Diagnosis and Medicines
  // slots change based on the selected category (e.g. a Lab Report needs
  // "Test/Panel Name" + "Key Results", not "Diagnosis" + "Medicines").
  const categoryFields = getCategoryFieldConfig(formData.category);

  const handleChange = (e) => {
    const { name, value, files } = e.target;

    if (files) {
      const file = files[0];

      if (file) {
        const maxSize = 10 * 1024 * 1024; // 10 MB

        if (file.size > maxSize) {
          alert("File size must be less than or equal to 10 MB.");
          e.target.value = "";
          return;
        }
      }

      setFormData((prev) => ({
        ...prev,
        [name]: file,
        analysis: "",
      }));

      setExtracted(false);
      setExtractError(null);
      setUnclearFields(new Set());

      if (file && isExtractableFile(file)) {
        runExtraction(file);
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
      // The patient has now either filled in what AI couldn't read, or
      // deliberately left it — either way it's no longer "AI couldn't read
      // this", so stop flagging it as unclear.
      setUnclearFields((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  async function runExtraction(file) {
    setExtracting(true);
    setExtractError(null);
    try {
      const { fields, unclear = [] } = await extractReportFromFile(file);
      setFormData((prev) => ({
        ...prev,
        title: fields.title || prev.title,
        doctor: fields.doctor || prev.doctor,
        hospital: fields.hospital || prev.hospital,
        date: fields.reportDate || prev.date,
        category: fields.category || prev.category,
        diagnosis: fields.diagnosis || prev.diagnosis,
        medicines: fields.medicines || prev.medicines,
        notes: fields.notes || prev.notes,
      }));
      // rag's field name is "reportDate", this form's is "date" — map it.
      setUnclearFields(new Set(unclear.map((key) => (key === 'reportDate' ? 'date' : key))));
      setExtracted(true);
      // Hand off to Manual Entry so the user reviews/corrects AI-extracted
      // fields before saving — never save Vision output unreviewed, it can
      // misread handwriting, dosages, or dates.
      setActiveTab("manual");
    } catch (err) {
      setExtractError(err.message || "Could not read this file automatically. Please fill the form manually.");
    } finally {
      setExtracting(false);
    }
  }

  const handleSubmit = () => {
    if (activeTab === 'upload' && !formData.file && !formData.fileUrl) {
      alert('Please upload your prescription or report file.');
      return;
    }

    // Only Title, Visit Date, and Category are hard requirements (matches
    // backend/utils/timelineValidation.js). Doctor/Hospital/Diagnosis/
    // Medicines are allowed blank — a field AI couldn't read from illegible
    // handwriting and the patient doesn't know either gets saved blank and
    // flagged, rather than forced to a fake value, so a clinician reviewing
    // it later knows to check the original document instead of trusting it.
    if (!formData.title.trim()) {
      alert('Please enter Report Title.');
      return;
    }

    if (!formData.date) {
      alert('Please select Visit Date.');
      return;
    }

    if (!formData.category) {
      alert('Please select Report Category.');
      return;
    }

    onSubmit({
      id: isEditing ? initialEvent.id : `temp-${Date.now()}`,
      ...formData,
      // Field names still unclear/unfilled at save time — surfaced on the
      // saved report so a doctor viewing it later knows to check the
      // original document rather than trust an empty field as "nothing".
      unclearFields: Array.from(unclearFields).filter((key) => !String(formData[key] || '').trim()),
    });

    onClose();
  };


  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        {/* Header */}

        <div className="flex justify-between items-center border-b p-6">

          <h2 className="text-2xl font-semibold">
            {isEditing ? "Edit Medical Report" : "Upload New Medical Report"}
          </h2>

          <button onClick={onClose}>
            <X className="w-6 h-6" />
          </button>

        </div>

        <div className="p-6 space-y-6">
{!isEditing && (
<div className="flex bg-gray-100 rounded-xl p-1">

    <button
        onClick={() => {
            setActiveTab("upload");
            setHasPrescription(true);
        }}
        className={`flex-1 py-3 rounded-lg transition font-medium ${
            activeTab === "upload"
                ? "bg-blue-600 text-white shadow"
                : "text-gray-600"
        }`}
    >
        📄 Upload Prescription
    </button>

    <button
        onClick={() => {
            setActiveTab("manual");
            setHasPrescription(false);
        }}
        className={`flex-1 py-3 rounded-lg transition font-medium ${
            activeTab === "manual"
                ? "bg-blue-600 text-white shadow"
                : "text-gray-600"
        }`}
    >
         Manual Entry
    </button>

</div>
)}
          {/* Upload */}

          {!isEditing && activeTab === "upload" && (
            <>
              <div className="border-2 border-dashed rounded-xl p-8 text-center">
                <UploadCloud className="mx-auto w-12 h-12 text-blue-600 mb-3" />

                <h3 className="font-semibold text-lg">Upload Prescription</h3>

                <p className="text-gray-500 text-sm mb-4">Upload PDF / JPG / PNG</p>

                <input
                  type="file"
                  name="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                  onChange={handleChange}
                />

                <p className="text-xs text-gray-500 mt-2">Maximum upload size: 10 MB</p>
                {formData.file && (
                  <p className="mt-3 text-green-600 text-sm font-medium flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    {formData.file.name} selected
                  </p>
                )}

                {formData.file && !isExtractableFile(formData.file) && (
                  <div className="bg-amber-50 mt-5 rounded-lg p-4 text-left">
                    <p className="font-semibold text-amber-700">Unsupported file type</p>
                    <p className="text-sm text-gray-600">
                      Please upload a PDF or a common image file such as JPG, PNG, or WEBP.
                    </p>
                  </div>
                )}

                {extracting && (
                  <div className="bg-blue-50 mt-5 rounded-lg p-4 text-left flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                    <div>
                      <p className="font-semibold text-blue-700">Reading your report with AI...</p>
                      <p className="text-sm text-gray-600">
                        Detecting doctor, medicines, diagnosis and hospital automatically.
                      </p>
                    </div>
                  </div>
                )}

                {!extracting && extracted && (
                  <div className="bg-green-50 mt-5 rounded-lg p-4 text-left flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-green-700">Details extracted</p>
                      <p className="text-sm text-gray-600">
                        Review the auto-filled fields under Manual Entry before saving — AI can
                        misread handwriting or numbers.
                      </p>
                    </div>
                  </div>
                )}

                {!extracting && extractError && (
                  <div className="bg-red-50 mt-5 rounded-lg p-4 text-left">
                    <p className="font-semibold text-red-700">Couldn't auto-read this file</p>
                    <p className="text-sm text-gray-600">{extractError}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      This is often a temporary server issue — retrying usually works.
                    </p>
                    <button
                      type="button"
                      onClick={() => runExtraction(formData.file)}
                      className="mt-3 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 transition-colors text-white text-sm font-semibold px-4 py-2 rounded-lg"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry AI Scan
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Manual Form */}

          {activeTab === "manual" && (
            <div className="space-y-5">
              {unclearFields.size > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-amber-600 text-lg leading-none mt-0.5">⚠</span>
                  <div>
                    <p className="font-semibold text-amber-700">
                      AI couldn't confidently read {unclearFields.size === 1 ? "one field" : `${unclearFields.size} fields`}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Fields marked <span className="font-medium text-amber-700">"AI unsure"</span> below are
                      blank or low-confidence — usually from illegible handwriting. Fill them in if you know
                      the answer, or leave them blank: the saved report will flag them so a doctor can check
                      the original document later instead of trusting a guess.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="font-medium">
                  Report Title <span className="text-red-500">*</span>
                </label>

                <input
                  type="text"
                  name="title"
                  placeholder="e.g. Diabetes Follow-up"
                  value={formData.title}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
                />
              </div>

              <FormField
                label="Doctor Name"
                name="doctor"
                value={formData.doctor}
                onChange={handleChange}
                unclear={unclearFields.has('doctor')}
              />

              <FormField
                label="Hospital"
                name="hospital"
                value={formData.hospital}
                onChange={handleChange}
                unclear={unclearFields.has('hospital')}
              />

              <div>
                <label className="font-medium">
                  Visit Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className={`w-full border rounded-lg p-3 mt-1 ${unclearFields.has('date') ? 'border-amber-400 bg-amber-50' : ''}`}
                />
              </div>

              <div>
                <label className="font-medium">
                  Category <span className="text-red-500">*</span>
                </label>

                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
                >
                  <option>Prescription</option>
                  <option>Lab Report</option>
                  <option>Imaging</option>
                  <option>Vaccination</option>
                  <option>Consultation</option>
                </select>

              </div>

              {categoryFields.diagnosis && (
                <FormField
                  label={categoryFields.diagnosis.label}
                  placeholder={categoryFields.diagnosis.placeholder}
                  name="diagnosis"
                  value={formData.diagnosis}
                  onChange={handleChange}
                  unclear={unclearFields.has('diagnosis')}
                  textarea
                />
              )}

              {categoryFields.medicines && (
                <FormField
                  label={categoryFields.medicines.label}
                  placeholder={categoryFields.medicines.placeholder}
                  name="medicines"
                  value={formData.medicines}
                  onChange={handleChange}
                  unclear={unclearFields.has('medicines')}
                  textarea
                />
              )}

              <div className="col-span-2">
                <FormField
                  label="Notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  unclear={unclearFields.has('notes')}
                  textarea
                />
              </div>

              </div>
            </div>
          )}

          {/* Buttons */}

          <div className="flex justify-end gap-4 pt-4">

            <button
              onClick={onClose}
              className="px-6 py-3 rounded-lg border"
            >
              Cancel
            </button>

            <button
              onClick={handleSubmit}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              {isEditing ? "Save Changes" : "Save Report"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}

function FormField({ label, name, value, onChange, unclear, textarea, placeholder }) {
  const Tag = textarea ? "textarea" : "input";
  return (
    <div>
      <label className="font-medium flex items-center gap-2">
        {label}
        {unclear && (
          <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
            AI unsure
          </span>
        )}
      </label>
      <Tag
        {...(textarea ? { rows: 3 } : {})}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={unclear ? "Fill in if you know it, or leave blank" : placeholder}
        className={`w-full border rounded-lg p-3 mt-1 ${unclear ? 'border-amber-400 bg-amber-50' : ''}`}
      />
    </div>
  );
}
