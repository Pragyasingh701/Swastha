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
} from "lucide-react";
import { extractReportFromFile } from "../../../../api/search";

// Gemini Vision extraction only accepts rasterized images — PDFs aren't
// supported there yet, see rag/src/routes/extract.js.
const EXTRACTABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function UploadReports({ onClose, onSubmit }) {
  const [hasPrescription, setHasPrescription] = useState(true);
  const [activeTab, setActiveTab] = useState("upload");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [extracted, setExtracted] = useState(false);

  const [formData, setFormData] = useState({
  title: "",
  doctor: "",
  hospital: "",
  date: "",
  diagnosis: "",
  medicines: "",
  notes: "",
  category: "Prescription",
  file: null,
});

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
    }));

    setExtracted(false);
    setExtractError(null);

    if (file && EXTRACTABLE_TYPES.includes(file.type)) {
      runExtraction(file);
    }
  } else {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }
  };

  async function runExtraction(file) {
    setExtracting(true);
    setExtractError(null);
    try {
      const { fields } = await extractReportFromFile(file);
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
    if (activeTab === 'upload' && !formData.file) {
      alert('Please upload your prescription or report file.');
      return;
    }

    if (!formData.title.trim()) {
      alert('Please enter Report Title.');
      return;
    }

    if (!formData.doctor.trim()) {
      alert('Please enter Doctor Name.');
      return;
    }

    if (!formData.hospital.trim()) {
      alert('Please enter Hospital Name.');
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

    if (!formData.diagnosis.trim()) {
      alert('Please enter Diagnosis.');
      return;
    }

    if (!formData.medicines.trim()) {
      alert('Please enter Medicines.');
      return;
    }

    onSubmit({
      id: `temp-${Date.now()}`,
      ...formData,
    });

    onClose();
};

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">

        {/* Header */}

        <div className="flex justify-between items-center border-b p-6">

          <h2 className="text-2xl font-semibold">
            Upload New Medical Report
          </h2>

          <button onClick={onClose}>
            <X className="w-6 h-6" />
          </button>

        </div>

        <div className="p-6 space-y-6">
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
          {/* Upload */}

          {activeTab === "upload" && (
            <>
              <div className="border-2 border-dashed rounded-xl p-8 text-center">
                <UploadCloud className="mx-auto w-12 h-12 text-blue-600 mb-3" />

                <h3 className="font-semibold text-lg">Upload Prescription</h3>

                <p className="text-gray-500 text-sm mb-4">Upload PDF / JPG / PNG</p>

                <input
                  type="file"
                  name="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleChange}
                />

                <p className="text-xs text-gray-500 mt-2">Maximum upload size: 10 MB</p>
                {formData.file && (
                  <p className="mt-3 text-green-600 text-sm font-medium">✓ {formData.file.name}</p>
                )}

                {formData.file && !EXTRACTABLE_TYPES.includes(formData.file.type) && (
                  <div className="bg-amber-50 mt-5 rounded-lg p-4 text-left">
                    <p className="font-semibold text-amber-700">PDF uploaded</p>
                    <p className="text-sm text-gray-600">
                      AI extraction currently works on JPG/PNG images only. Please fill in the
                      details manually under the Manual Entry tab.
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
                  </div>
                )}
              </div>
            </>
          )}

          {/* Manual Form */}

          {activeTab === "manual" && (
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

              <div>
                <label className="font-medium">
                  Doctor Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="doctor"
                  value={formData.doctor}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
                />
              </div>

              <div>
                <label className="font-medium">
                  Hospital <span className="text-red-500">*</span>
                </label>
                <input
                  name="hospital"
                  value={formData.hospital}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
                />
              </div>

              <div>
                <label className="font-medium">
                  Visit Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
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

              <div>
                <label className="font-medium">
                  Diagnosis <span className="text-red-500">*</span>
                </label>

                <textarea
                  rows={3}
                  name="diagnosis"
                  value={formData.diagnosis}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
                />
              </div>

              <div>
                <label className="font-medium">
                  Medicines <span className="text-red-500">*</span>
                </label>

                <textarea
                  rows={3}
                  name="medicines"
                  value={formData.medicines}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
                />
              </div>

              <div className="col-span-2">
                <label className="font-medium">Notes</label>

                <textarea
                  rows={3}
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full border rounded-lg p-3 mt-1"
                />
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
              Save Report
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}