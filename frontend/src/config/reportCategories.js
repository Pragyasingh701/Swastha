import { ClipboardList, FlaskConical, ScanLine, Syringe, FileText } from "lucide-react";

// The one list of report categories. Reports have been saved under more than one
// spelling ("Lab Report" / "Lab Reports", "Imaging" / "MRI/Scans", "Vaccination" /
// "Immunizations"), so each category lists every name it is known by, and every
// page looks a report's category up here instead of keeping its own table.
//
// `fields` says what the two generic columns mean for the category: a report's
// `diagnosis` is really a test name for a lab report, a vaccine name for a
// vaccination, and so on. `short` is the label for tight spaces.
export const REPORT_CATEGORIES = [
  {
    key: "prescription",
    label: "Prescription",
    names: ["Prescription", "Prescriptions"],
    icon: ClipboardList,
    kind: "medication",
    tone: "bg-blue-50 text-blue-600 ",
    fields: {
      diagnosis: { label: "Diagnosis", short: "Diagnosis", placeholder: "e.g. Type 2 Diabetes Mellitus" },
      medicines: {
        label: "Medicines",
        short: "Medicines",
        placeholder:
          "e.g.\nTab. Metformin 500mg — 1 tablet twice daily, 30 days, after food\nTab. Amlodipine 5mg — 1 tablet once daily, 30 days",
      },
    },
  },
  {
    key: "lab",
    label: "Lab Report",
    names: ["Lab Report", "Lab Reports"],
    icon: FlaskConical,
    kind: "lab",
    tone: "bg-orange-50 text-orange-600 ",
    fields: {
      diagnosis: { label: "Test / Panel Name", short: "Test / Panel", placeholder: "e.g. Complete Blood Count (CBC)" },
      medicines: { label: "Key Results / Values", short: "Key Results", placeholder: "e.g. Hemoglobin 13.2 g/dL, WBC 7,200/µL" },
    },
  },
  {
    key: "imaging",
    label: "Imaging",
    names: ["Imaging", "MRI/Scans", "MRI / Scans", "Scans"],
    icon: ScanLine,
    kind: "imaging",
    tone: "bg-slate-100 text-slate-600 ",
    fields: {
      diagnosis: { label: "Findings", short: "Findings", placeholder: "e.g. No acute abnormality, mild disc bulge at L4-L5" },
      medicines: { label: "Body Part / Scan Type", short: "Scan Type", placeholder: "e.g. MRI Lumbar Spine" },
    },
  },
  {
    key: "immunization",
    label: "Vaccination",
    names: ["Vaccination", "Vaccinations", "Immunization", "Immunizations"],
    icon: Syringe,
    kind: "immunization",
    tone: "bg-slate-100 text-slate-600 ",
    fields: {
      diagnosis: { label: "Vaccine Name", short: "Vaccine", placeholder: "e.g. Influenza (Flu) Vaccine" },
      medicines: { label: "Dose / Batch Info", short: "Dose / Batch", placeholder: "e.g. Dose 2 of 2, Batch #A1234" },
    },
  },
  {
    key: "consultation",
    label: "Consultation",
    names: ["Consultation", "Consultations"],
    icon: FileText,
    kind: "consultation",
    tone: "bg-slate-100 text-slate-600 ",
    fields: {
      diagnosis: { label: "Reason for Visit", short: "Reason for Visit", placeholder: "e.g. Routine check-up, follow-up on BP" },
      medicines: null, // often not applicable for a plain consultation, so the field is hidden
    },
  },
];

const byName = new Map();
for (const category of REPORT_CATEGORIES) {
  for (const name of category.names) byName.set(name.trim().toLowerCase(), category);
}
const byKey = new Map(REPORT_CATEGORIES.map((c) => [c.key, c]));

/** The category a stored name belongs to, or null if it is not a known name. */
export function findReportCategory(name) {
  return byName.get(String(name || "").trim().toLowerCase()) || null;
}

/** Like findReportCategory, but an unknown name falls back to `fallbackKey` (default: consultation). */
export function getReportCategory(name, fallbackKey = "consultation") {
  return findReportCategory(name) || byKey.get(fallbackKey);
}

/** The names offered when someone files a report by hand. */
export const REPORT_CATEGORY_CHOICES = REPORT_CATEGORIES.map((c) => c.label);

// The four cards on the vault pages. Anything that is not a prescription, lab report
// or scan lands in "Other Records", so the card counts always add up to the total.
export const VAULT_CATEGORY_CARDS = [
  { title: "Prescriptions", keys: ["prescription"], icon: ClipboardList },
  { title: "Lab Reports", keys: ["lab"], icon: FlaskConical },
  { title: "Scans & Imaging", keys: ["imaging"], icon: ScanLine },
  { title: "Other Records", keys: ["immunization", "consultation"], icon: FileText },
];

/** Index into VAULT_CATEGORY_CARDS for a stored category name. */
export function vaultCardIndex(name) {
  const category = findReportCategory(name);
  const index = category ? VAULT_CATEGORY_CARDS.findIndex((card) => card.keys.includes(category.key)) : -1;
  return index === -1 ? VAULT_CATEGORY_CARDS.length - 1 : index;
}

/** { diagnosis, medicines } labels for a report's detail view (an unknown category reads like a prescription). */
export function categoryFieldLabels(name) {
  const { fields } = getReportCategory(name, "prescription");
  return { diagnosis: fields.diagnosis.label, medicines: fields.medicines ? fields.medicines.label : "Medicines" };
}
