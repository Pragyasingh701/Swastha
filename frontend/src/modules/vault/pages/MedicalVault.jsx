import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { getTimelineReports, generateReportSummary } from "../../../api/reports";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Settings,
  HelpCircle,
  PlusCircle,
  Search,
  ShieldCheck,
  FileText,
  Sparkles,
  FlaskConical,
  ScanLine,
  Syringe,
  X,
  ExternalLink,
  Loader2,
  RefreshCw,
  Stethoscope,
  Building2,
  CalendarDays,
} from "lucide-react";

/* -----------------------------------------------------------
   Nav + category config — same shape as Timeline.jsx so a report's
   category always maps to the same icon everywhere in the app.
------------------------------------------------------------ */

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, active: true, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

const CATEGORY_META = {
  Prescription: { icon: ClipboardList, tone: "bg-blue-50 text-blue-600" },
  Prescriptions: { icon: ClipboardList, tone: "bg-blue-50 text-blue-600" },
  "Lab Report": { icon: FlaskConical, tone: "bg-orange-50 text-orange-600" },
  "Lab Reports": { icon: FlaskConical, tone: "bg-orange-50 text-orange-600" },
  Imaging: { icon: ScanLine, tone: "bg-slate-100 text-slate-600" },
  Vaccination: { icon: Syringe, tone: "bg-slate-100 text-slate-600" },
  Consultation: { icon: FileText, tone: "bg-slate-100 text-slate-600" },
};

// Category cards shown in "AI Smart Categorization" — fixed set of labels
// the four common report categories map into (Consultation/Vaccination
// reports fall under a general "Other Records" bucket rather than being
// hidden).
const CATEGORY_CARDS = [
  { title: "Prescriptions", match: ["Prescription", "Prescriptions"], icon: ClipboardList },
  { title: "Lab Reports", match: ["Lab Report", "Lab Reports"], icon: FlaskConical },
  { title: "Scans & Imaging", match: ["Imaging"], icon: ScanLine },
  { title: "Other Records", match: ["Vaccination", "Consultation"], icon: FileText },
];

function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META.Consultation;
}

// What the "diagnosis" and "medicines" fields actually mean depends on
// category (matches UploadReports.jsx's CATEGORY_FIELD_CONFIG) — used to
// label the highlight chips in the AI Summary view correctly, e.g. a Lab
// Report's diagnosis slot is really the test/panel name, not a diagnosis.
const SUMMARY_FIELD_LABELS = {
  Prescription: { diagnosis: "Diagnosis", medicines: "Medicines" },
  Prescriptions: { diagnosis: "Diagnosis", medicines: "Medicines" },
  "Lab Report": { diagnosis: "Test / Panel", medicines: "Key Results" },
  "Lab Reports": { diagnosis: "Test / Panel", medicines: "Key Results" },
  Imaging: { diagnosis: "Findings", medicines: "Scan Type" },
  Vaccination: { diagnosis: "Vaccine", medicines: "Dose / Batch" },
  Consultation: { diagnosis: "Reason for Visit", medicines: null },
};

function summaryFieldLabels(category) {
  return SUMMARY_FIELD_LABELS[category] || SUMMARY_FIELD_LABELS.Consultation;
}

function formatDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function MedicalVault() {
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(null);
  // View Details and AI Summary are two completely separate views now —
  // each has its own selected-report state so opening one never shows
  // content from the other.
  const [detailsReport, setDetailsReport] = useState(null);
  const [summaryReport, setSummaryReport] = useState(null);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setReports([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getTimelineReports(token)
      .then((response) => {
        if (cancelled) return;
        const list = Array.isArray(response?.reports) ? response.reports : [];
        // Newest first, same ordering convention as Timeline.
        list.sort((a, b) => new Date(b.reportDate || b.createdAt || 0) - new Date(a.reportDate || a.createdAt || 0));
        setReports(list);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load vault documents:", err);
        setError(err.message || "Failed to load documents.");
        setReports([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  const categoryCounts = useMemo(() => {
    const counts = CATEGORY_CARDS.map(() => 0);
    for (const report of reports) {
      const idx = CATEGORY_CARDS.findIndex((c) => c.match.includes(report.category));
      if (idx !== -1) counts[idx] += 1;
    }
    return counts;
  }, [reports]);

  const filteredReports = useMemo(() => {
    let list = reports;

    if (categoryFilter) {
      const card = CATEGORY_CARDS.find((c) => c.title === categoryFilter);
      if (card) list = list.filter((r) => card.match.includes(r.category));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.title, r.doctor, r.hospital, r.category]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(q))
      );
    }

    return list;
  }, [reports, categoryFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 min-w-0 overflow-x-hidden">
        <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        <SummaryRow reports={reports} loading={loading} />
        <SmartCategorization
          categoryCounts={categoryCounts}
          activeCategory={categoryFilter}
          onSelectCategory={(title) => setCategoryFilter((prev) => (prev === title ? null : title))}
        />
        <RecentActivity
          reports={filteredReports}
          loading={loading}
          error={error}
          activeCategory={categoryFilter}
          onClearFilter={() => setCategoryFilter(null)}
          onViewDetails={setDetailsReport}
          onViewSummary={setSummaryReport}
          onViewAll={() => navigate("/timeline")}
        />
      </main>

      {detailsReport && (
        <ReportPreview report={detailsReport} onClose={() => setDetailsReport(null)} />
      )}

      {summaryReport && (
        <AISummaryView
          report={summaryReport}
          token={token}
          onSummaryGenerated={(reportId, summary) => {
            // Reflect the freshly-generated summary in the list too, so
            // reopening it later (or the "N summaries ready" style counts,
            // if added later) doesn't need a full reload.
            setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, analysis: summary } : r)));
            setSummaryReport((prev) => (prev && prev.id === reportId ? { ...prev, analysis: summary } : prev));
          }}
          onClose={() => setSummaryReport(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------- Sidebar ---------------------------- */

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 border-r border-slate-200 min-h-screen px-4 py-6">
      <div className="px-2 mb-8">
        <h1 className="text-xl font-bold text-blue-700 leading-tight">Swastha AI</h1>
        <p className="text-[10px] tracking-widest text-slate-400 font-medium mt-0.5">
          CLINICAL INTELLIGENCE
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon: Icon, active, route }) => {
          const isActive = Boolean(route && (pathname === route || pathname.startsWith(`${route}/`))) || active;

          return (
            <button
              key={label}
              type="button"
              onClick={() => route && navigate(route)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
            <Icon size={18} />
            {label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 pt-4">
        <button
          type="button"
          onClick={() => navigate("/timeline?upload=true")}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 transition-colors text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          <PlusCircle size={18} />
          Upload New Report
        </button>

        <div className="space-y-1 pt-2">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
            <Settings size={18} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
            <HelpCircle size={18} />
            Support
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ----------------------------- Top bar ----------------------------- */

function TopBar({ searchQuery, onSearchChange }) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
      <div className="flex-1 relative min-w-0">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search clinical documents, doctor names, or symptoms..."
          className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
        />
      </div>

      <div className="flex items-center justify-between sm:justify-start gap-3 shrink-0">
        <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-2 rounded-full whitespace-nowrap transition-transform duration-200 hover:scale-105">
          <ShieldCheck size={14} />
          PRIVATE
        </span>
      </div>
    </header>
  );
}

/* --------------------------- Summary cards --------------------------- */

function SummaryRow({ reports, loading }) {
  const total = reports.length;
  const now = new Date();
  const thisMonth = reports.filter((r) => {
    const d = new Date(r.createdAt || r.reportDate || 0);
    return !Number.isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const recentDocs = [...reports]
    .filter((r) => r.fileUrl)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">Total Documents</p>
          <div className="w-9 h-9 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
            <FileText size={16} />
          </div>
        </div>
        <p className="text-3xl font-bold text-slate-900">{loading ? "—" : total}</p>
        {thisMonth > 0 && (
          <p className="text-xs text-emerald-600 mt-3">+{thisMonth} this month</p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-500">Recent Uploads</p>
          <div className="w-9 h-9 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center">
            <PlusCircle size={16} />
          </div>
        </div>
        {recentDocs.length > 0 ? (
          <div className="flex items-center -space-x-2 mt-1">
            {recentDocs.map((doc) => {
              const meta = categoryMeta(doc.category);
              const Icon = meta.icon;
              return (
                <span
                  key={doc.id}
                  title={doc.title}
                  className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-slate-500"
                >
                  <Icon size={13} />
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400 mt-1">No uploads yet</p>
        )}
      </div>
    </div>
  );
}

/* ----------------------- AI smart categorization ----------------------- */

function SmartCategorization({ categoryCounts, activeCategory, onSelectCategory }) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <Sparkles size={16} className="text-blue-600" />
            AI Smart Categorization
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Documents are automatically tagged and filed by category.
          </p>
        </div>
        {activeCategory && (
          <button
            type="button"
            onClick={() => onSelectCategory(activeCategory)}
            className="flex items-center gap-1 text-sm font-medium text-blue-600 transition-all duration-200 hover:gap-2"
          >
            Clear filter
            <X size={15} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CATEGORY_CARDS.map(({ title, icon: Icon }, index) => {
          const isActive = activeCategory === title;
          const count = categoryCounts[index];

          return (
            <button
              type="button"
              key={title}
              onClick={() => onSelectCategory(title)}
              className={`group bg-white border rounded-2xl p-5 min-h-[140px] flex flex-col justify-between text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer ${
                isActive ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-200"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
                  isActive ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600"
                }`}
              >
                <Icon size={18} />
              </div>
              <div>
                <p className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors duration-200">
                  {title}
                </p>
                <p className="text-sm text-slate-400 mt-0.5">
                  {count} {count === 1 ? "item" : "items"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------- Recent activity --------------------------- */

function RecentActivity({ reports, loading, error, activeCategory, onClearFilter, onViewDetails, onViewSummary, onViewAll }) {
  const visibleDocs = reports.slice(0, 8);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-shadow duration-300 hover:shadow-lg">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h3 className="font-semibold text-slate-900">
          {activeCategory ? `${activeCategory}` : "Recent Activity"}
        </h3>
        {activeCategory && (
          <button
            type="button"
            onClick={onClearFilter}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <X size={13} />
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-10">Loading documents...</p>
      ) : error ? (
        <p className="text-sm text-red-600 text-center py-10">{error}</p>
      ) : visibleDocs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-10">
          {activeCategory ? "No documents in this category yet." : "No documents uploaded yet."}
        </p>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {visibleDocs.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                onViewDetails={() => onViewDetails(doc)}
                onViewSummary={() => onViewSummary(doc)}
              />
            ))}
          </div>

          {/* sm and up: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="pb-3 font-medium">Document Name</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleDocs.map((doc) => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    onViewDetails={() => onViewDetails(doc)}
                    onViewSummary={() => onViewSummary(doc)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="w-full text-center text-sm font-medium text-blue-600 mt-5 pt-4 border-t border-slate-100 transition-colors duration-200 hover:text-blue-700"
      >
        View All Documents
      </button>
    </div>
  );
}

function DocCard({ doc, onViewDetails, onViewSummary }) {
  const meta = categoryMeta(doc.category);
  const Icon = meta.icon;

  return (
    <div className="border border-slate-100 rounded-xl p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900 truncate">{doc.title || "Untitled report"}</p>
          <p className="text-xs text-slate-400">{doc.hospital || doc.doctor || "Unknown source"}</p>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-2 mb-3">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${meta.tone}`}>
          {doc.category || "Consultation"}
        </span>
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {formatDate(doc.reportDate)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onViewDetails}
          className="flex-1 text-xs font-semibold px-3.5 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all duration-200"
        >
          View Details
        </button>
        <button
          type="button"
          onClick={onViewSummary}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md transition-all duration-200"
        >
          <Sparkles size={13} />
          AI Summary
        </button>
      </div>
    </div>
  );
}

function DocRow({ doc, onViewDetails, onViewSummary }) {
  const meta = categoryMeta(doc.category);
  const Icon = meta.icon;

  return (
    <tr className="group border-b border-slate-50 last:border-0 transition-colors duration-200 hover:bg-slate-50/60">
      <td className="py-4 pr-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${meta.tone}`}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 truncate">{doc.title || "Untitled report"}</p>
            <p className="text-xs text-slate-400">{doc.hospital || doc.doctor || "Unknown source"}</p>
          </div>
        </div>
      </td>
      <td className="py-4 pr-4">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${meta.tone}`}>
          {doc.category || "Consultation"}
        </span>
      </td>
      <td className="py-4 pr-4 text-slate-500 whitespace-nowrap">
        {formatDate(doc.reportDate)}
      </td>
      <td className="py-4 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onViewDetails}
            className="text-xs font-semibold px-3.5 py-2 rounded-lg whitespace-nowrap bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all duration-200"
          >
            View Details
          </button>
          <button
            type="button"
            onClick={onViewSummary}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md transition-all duration-200"
          >
            <Sparkles size={13} />
            AI Summary
          </button>
        </div>
      </td>
    </tr>
  );
}

/* --------------------------- Report preview --------------------------- */

function ReportPreview({ report, onClose }) {
  const meta = categoryMeta(report.category);
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.tone}`}>
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                {report.category || "Consultation"}
              </p>
              <h2 className="text-lg font-semibold text-slate-900 truncate">
                {report.title || "Untitled report"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-slate-50 p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Date</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(report.reportDate)}</p>
          </div>
          {report.doctor && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Doctor</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{report.doctor}</p>
            </div>
          )}
          {report.hospital && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Hospital</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{report.hospital}</p>
            </div>
          )}
          {report.diagnosis && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Diagnosis</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{report.diagnosis}</p>
            </div>
          )}
        </div>

        {report.notes && (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Notes</p>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-line">{report.notes}</p>
          </div>
        )}

        {report.fileUrl ? (
          <a
            href={report.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 p-3 text-blue-700 transition-colors hover:bg-blue-100"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <FileText size={16} />
              View original document
            </span>
            <ExternalLink size={16} />
          </a>
        ) : (
          <p className="mt-5 text-xs text-slate-400 text-center">No file attached to this report.</p>
        )}
      </div>
    </div>
  );
}

/* --------------------------- AI Summary view --------------------------- */
/* Completely separate from ReportPreview — no shared modal, no shared
   content. If the report has no summary yet, generation kicks off the
   moment this view opens (not on a separate button click). */

function AISummaryView({ report: initialReport, token, onSummaryGenerated, onClose }) {
  const [report, setReport] = useState(initialReport);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);

  const meta = categoryMeta(report.category);
  const Icon = meta.icon;
  const fieldLabels = summaryFieldLabels(report.category);

  async function runGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const { report: updated } = await generateReportSummary(report.id, token);
      setReport(updated);
      onSummaryGenerated(report.id, updated.analysis);
    } catch (err) {
      console.error("Failed to generate AI summary:", err);
      setGenError(err.message || "Could not generate a summary. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  // Generate automatically the moment this view opens, if there isn't
  // already a summary — never require a second click just to kick it off.
  useEffect(() => {
    if (!report.analysis && !generating) {
      runGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const highlights = [
    fieldLabels.diagnosis && report.diagnosis
      ? { label: fieldLabels.diagnosis, value: report.diagnosis, icon: Stethoscope }
      : null,
    fieldLabels.medicines && report.medicines
      ? { label: fieldLabels.medicines, value: report.medicines, icon: ClipboardList }
      : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
        {/* Header banner — distinct visual identity from View Details so
            the two never look like the same surface. */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-t-3xl p-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Sparkles size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                  AI Summary
                </p>
                <h2 className="text-lg font-semibold truncate">{report.title || "Untitled report"}</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/15 p-2.5 text-white transition-colors hover:bg-white/25 shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-4 text-xs text-blue-100">
            <span className="flex items-center gap-1.5">
              <CalendarDays size={13} />
              {formatDate(report.reportDate)}
            </span>
            {report.doctor && (
              <span className="flex items-center gap-1.5">
                <Stethoscope size={13} />
                {report.doctor}
              </span>
            )}
            {report.hospital && (
              <span className="flex items-center gap-1.5">
                <Building2 size={13} />
                {report.hospital}
              </span>
            )}
          </div>
        </div>

        <div className="p-6">
          {generating ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Loader2 className="w-7 h-7 text-blue-600 animate-spin mb-3" />
              <p className="text-sm font-medium text-slate-700">Generating AI summary...</p>
              <p className="text-xs text-slate-400 mt-1">Reading the full report to write a plain-language summary.</p>
            </div>
          ) : genError ? (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
              <p className="text-sm font-semibold text-red-700">Couldn't generate a summary</p>
              <p className="text-xs text-red-600 mt-1">{genError}</p>
              <button
                type="button"
                onClick={runGenerate}
                className="mt-3 inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 transition-colors text-white text-xs font-semibold px-4 py-2 rounded-lg"
              >
                <RefreshCw size={13} />
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* AI-written narrative */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                  {report.analysis}
                </p>
              </div>

              {/* Structured highlight chips — the scannable version of the
                  same facts, category-aware labels. */}
              {highlights.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 mt-4">
                  {highlights.map(({ label, value, icon: HighlightIcon }) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        <HighlightIcon size={13} />
                        {label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-4">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.tone}`}>
                  <Icon size={12} />
                  {report.category || "Consultation"}
                </span>
                <button
                  type="button"
                  onClick={runGenerate}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <RefreshCw size={12} />
                  Regenerate
                </button>
              </div>
            </>
          )}

          {report.fileUrl && (
            <a
              href={report.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700 transition-colors hover:bg-slate-100"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <FileText size={16} />
                View original document
              </span>
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
