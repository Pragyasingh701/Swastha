import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Search, ChevronDown, User, ClipboardList, FlaskConical, ScanLine, Syringe, FileText, RefreshCw, Stethoscope, Pill, TrendingUp, CalendarClock } from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import { getDoctorPatients, getDoctorPatientSummary } from "../../../services/doctorPatients";
import { getTimelineReports } from "../../../api/reports";
import { useAuth } from "../../../context/AuthContext";

const CATEGORY_META = {
  Prescription: { icon: ClipboardList },
  Prescriptions: { icon: ClipboardList },
  "Lab Report": { icon: FlaskConical },
  "Lab Reports": { icon: FlaskConical },
  Imaging: { icon: ScanLine },
  "MRI/Scans": { icon: ScanLine },
  Vaccination: { icon: Syringe },
  Consultation: { icon: FileText },
};

function categoryIcon(category) {
  return (CATEGORY_META[category] || CATEGORY_META.Consultation).icon;
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return "Unknown date";
  const date = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ClinicalIntelligence() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [patients, setPatients] = useState([]);
  const [isFetchingPatients, setIsFetchingPatients] = useState(true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const pickerRef = useRef(null);

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState(null);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsFetchingPatients(true);
      try {
        const linkedPatients = await getDoctorPatients();
        if (!cancelled) setPatients(linkedPatients);
      } catch {
        if (!cancelled) setPatients([]);
      } finally {
        if (!cancelled) setIsFetchingPatients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setIsPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const name = (p.patient_name || p.name || "").toLowerCase();
      const email = (p.patient_email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [patients, patientSearch]);

  function selectPatient(patient) {
    setSelectedPatient(patient);
    setIsPickerOpen(false);
    setPatientSearch("");
  }

  const patientName = selectedPatient
    ? selectedPatient.patient_name || selectedPatient.name
    : null;

  const patientUserId = selectedPatient
    ? selectedPatient.patientUserId || selectedPatient.patientId || selectedPatient.id
    : null;

  // Real timeline for the selected patient.
  useEffect(() => {
    if (!selectedPatient || !token) {
      setReports([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setReportsLoading(true);
      setReportsError(null);
      try {
        const res = await getTimelineReports(token, selectedPatient.email || "", patientUserId);
        if (!cancelled) setReports(res.reports || []);
      } catch (err) {
        if (!cancelled) {
          setReportsError(err.message || "Failed to load patient records.");
          setReports([]);
        }
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPatient, patientUserId, token]);

  // AI summary — regenerates automatically whenever the patient's report
  // set changes (new report added/edited, or a different patient chosen).
  // Keyed on report id+updatedAt so an edit to an existing report also
  // triggers a fresh summary, not just a new report being added.
  const reportsFingerprint = useMemo(
    () => reports.map((r) => `${r.id}:${r.updatedAt || r.createdAt || ""}`).join("|"),
    [reports]
  );

  useEffect(() => {
    if (!patientUserId || reports.length === 0) {
      setSummary(null);
      setSummaryError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setSummaryLoading(true);
      setSummaryError(null);
      try {
        const res = await getDoctorPatientSummary(patientUserId);
        if (!cancelled) setSummary(res.summary || null);
      } catch (err) {
        if (!cancelled) {
          setSummaryError(err.message || "Could not generate a summary for this patient.");
          setSummary(null);
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientUserId, reportsFingerprint]);

  // Recent alerts derived from the patient's actual reports — newest
  // first, no invented clinical content.
  const recentAlerts = useMemo(() => {
    return [...reports]
      .sort((a, b) => new Date(b.reportDate || 0) - new Date(a.reportDate || 0))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        title: `${r.category || "Record"} added: ${r.title || "Untitled"}`,
        detail: r.diagnosis || r.notes || `${r.doctor ? `From ${r.doctor}` : "No additional detail"}${r.hospital ? ` · ${r.hospital}` : ""}`,
        time: formatRelativeDate(r.reportDate),
        icon: categoryIcon(r.category),
      }));
  }, [reports]);

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
          <NotificationBell />
          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#004ac6] ">Clinical intelligence</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight ">Patient Profile & AI Assistant</h2>
            </div>
          </div>

          {/* Patient picker — same pattern as Ask Swastha, scopes this whole page to one patient */}
          <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
            <div className="relative max-w-sm" ref={pickerRef}>
              <label className="block text-xs font-semibold text-[#434655] uppercase tracking-wide mb-2">
                Select a patient
              </label>
              <button
                type="button"
                onClick={() => setIsPickerOpen((v) => !v)}
                disabled={isFetchingPatients}
                className="w-full flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 hover:border-blue-300 transition-colors disabled:opacity-60"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Search size={16} className="text-slate-400 shrink-0" />
                  <span className={`truncate ${selectedPatient ? "" : "text-slate-400"}`}>
                    {isFetchingPatients
                      ? "Loading patients..."
                      : selectedPatient
                      ? patientName
                      : "Search or select a patient"}
                  </span>
                </span>
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              </button>

              {isPickerOpen && (
                <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        autoFocus
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                      />
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto">
                    {filteredPatients.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">
                        {patients.length === 0
                          ? "No linked patients yet — add one from the Patients page."
                          : "No patients match your search."}
                      </p>
                    ) : (
                      filteredPatients.map((p) => {
                        const pid = p.patientUserId || p.patientId || p.id;
                        const isSelected =
                          selectedPatient &&
                          pid === (selectedPatient.patientUserId || selectedPatient.patientId || selectedPatient.id);
                        return (
                          <button
                            key={pid}
                            type="button"
                            onClick={() => selectPatient(p)}
                            className={`w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition-colors ${
                              isSelected ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <User size={14} className="shrink-0 text-slate-400" />
                            <span className="truncate">{p.patient_name || p.name}</span>
                            {p.patient_email && (
                              <span className="text-xs text-slate-400 truncate">· {p.patient_email}</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {!selectedPatient ? (
            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <User size={24} />
              </div>
              <p className="text-slate-900 font-semibold text-lg mb-1.5">Choose a patient to get started</p>
              <p className="text-slate-400 text-sm">
                Select a patient above to view their clinical profile and AI insights.
              </p>
            </div>
          ) : (
            <>
              <section className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                  <div>
                    <p className="text-sm text-[#434655] ">Patient overview</p>
                    <h3 className="text-2xl font-bold ">{patientName}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-[#434655]">
                    {selectedPatient.age ? <span>{selectedPatient.age} yrs</span> : null}
                    {selectedPatient.gender ? <span>· {selectedPatient.gender}</span> : null}
                    {selectedPatient.blood_group ? <span>· {selectedPatient.blood_group}</span> : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#f3f3fe] rounded-xl p-4">
                    <p className="text-sm text-[#434655] ">Total records</p>
                    <div className="mt-3 text-3xl font-bold ">{reportsLoading ? "—" : reports.length}</div>
                    <div className="text-sm text-[#434655] ">in timeline</div>
                  </div>
                  <div className="bg-[#f3f3fe] rounded-xl p-4">
                    <p className="text-sm text-[#434655] ">Latest record</p>
                    <div className="mt-3 text-xl font-bold ">
                      {reportsLoading
                        ? "—"
                        : reports.length > 0
                        ? formatRelativeDate(
                            [...reports].sort((a, b) => new Date(b.reportDate || 0) - new Date(a.reportDate || 0))[0]
                              ?.reportDate
                          )
                        : "No records yet"}
                    </div>
                    <div className="text-sm text-[#434655] ">most recent entry</div>
                  </div>
                  <div className="bg-[#f3f3fe] rounded-xl p-4">
                    <p className="text-sm text-[#434655] ">Record types</p>
                    <div className="mt-3 text-3xl font-bold ">
                      {reportsLoading ? "—" : new Set(reports.map((r) => r.category).filter(Boolean)).size}
                    </div>
                    <div className="text-sm text-[#434655] ">distinct categories</div>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold ">AI Clinical Summary</h3>
                    {summaryLoading && (
                      <RefreshCw size={14} className="text-blue-500 animate-spin" />
                    )}
                  </div>
                  <span className="text-xs text-[#737686]">
                    Auto-updates when this patient's records change
                  </span>
                </div>

                {reports.length === 0 && !reportsLoading ? (
                  <p className="text-sm text-slate-400">
                    No records yet for this patient — a summary will appear once records are added.
                  </p>
                ) : summaryLoading ? (
                  <p className="text-sm text-slate-400">Generating summary…</p>
                ) : summaryError ? (
                  <p className="text-sm text-red-600">{summaryError}</p>
                ) : summary ? (
                  <StructuredSummary summary={summary} />
                ) : (
                  <p className="text-sm text-slate-400">Summary unavailable.</p>
                )}
              </section>

              <section>
                <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold ">Recent activity</h3>
                    <button
                      type="button"
                      onClick={() => navigate('/doctor/patients')}
                      className="text-sm text-[#004ac6] font-semibold"
                    >
                      View all
                    </button>
                  </div>

                  {reportsLoading ? (
                    <p className="text-sm text-slate-400 text-center py-6">Loading records...</p>
                  ) : reportsError ? (
                    <p className="text-sm text-red-600 text-center py-6">{reportsError}</p>
                  ) : recentAlerts.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No records yet for this patient.</p>
                  ) : (
                    <div className="space-y-3">
                      {recentAlerts.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.id} className="flex gap-3 rounded-xl bg-[#f3f3fe] p-3">
                            <div className="w-8 h-8 rounded-full bg-white text-[#004ac6] flex items-center justify-center shrink-0">
                              <Icon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-3">
                                <p className="font-semibold truncate">{item.title}</p>
                                <span className="text-xs text-[#434655] shrink-0">{item.time}</span>
                              </div>
                              <p className="mt-1 text-sm text-[#434655] line-clamp-2">{item.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* --------------------------- Structured AI summary --------------------------- */

const SUMMARY_SECTIONS = [
  { key: "diagnoses", label: "Diagnoses & Findings", icon: Stethoscope },
  { key: "medications", label: "Medications", icon: Pill },
  { key: "trends", label: "Trends & Recurring Patterns", icon: TrendingUp },
  { key: "followUps", label: "Suggested Follow-ups", icon: CalendarClock },
];

function StructuredSummary({ summary }) {
  const hasAnySection = SUMMARY_SECTIONS.some((s) => (summary[s.key] || []).length > 0);

  return (
    <div className="space-y-5">
      {summary.overview && (
        <p className="text-sm leading-relaxed text-slate-700">{summary.overview}</p>
      )}

      {hasAnySection ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SUMMARY_SECTIONS.map(({ key, label, icon: Icon }) => {
            const items = summary[key] || [];
            if (items.length === 0) return null;
            return (
              <div key={key} className="rounded-xl bg-[#f3f3fe] p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon size={15} className="text-[#004ac6]" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#434655]">{label}</p>
                </div>
                <ul className="space-y-1.5">
                  {items.map((item, idx) => (
                    <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-[#004ac6] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : !summary.overview ? (
        <p className="text-sm text-slate-400">Summary unavailable.</p>
      ) : null}
    </div>
  );
}
