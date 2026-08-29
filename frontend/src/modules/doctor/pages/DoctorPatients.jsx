import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell, X, CalendarDays, Stethoscope, XCircle, ChevronDown, ChevronRight, AlertTriangle, FlaskConical, ClipboardList, ScanLine, Syringe, FileText } from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import { getDoctorPatients, linkPatientToDoctor, deletePatientFromDoctor, requestAccessAgain } from "../../../services/doctorPatients";
import { getTimelineReports } from "../../../api/reports";
import { useAuth } from "../../../context/AuthContext";
import { usePolling } from "../../../hooks/usePolling";

// Diagnosis/Medicines are stored under the same column names for every
// category, but what they actually MEAN differs by category — mirrors
// UploadReports.jsx's CATEGORY_FIELD_CONFIG so a patient event popup here
// uses the same labels the manual entry form showed when the report was
// saved (e.g. a Lab Report shows "Test / Panel Name", not "Diagnosis").
const CATEGORY_FIELD_LABELS = {
  Prescription: { diagnosis: "Diagnosis", medicines: "Medicines" },
  "Lab Report": { diagnosis: "Test / Panel Name", medicines: "Key Results / Values" },
  Imaging: { diagnosis: "Findings", medicines: "Body Part / Scan Type" },
  Vaccination: { diagnosis: "Vaccine Name", medicines: "Dose / Batch Info" },
  Consultation: { diagnosis: "Reason for Visit", medicines: "Medicines" },
};

function categoryFieldLabels(category) {
  return CATEGORY_FIELD_LABELS[category] || CATEGORY_FIELD_LABELS.Prescription;
}

export default function DoctorPatients() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedTab, setSelectedTab] = useState('timeline');
  const [patientTimeline, setPatientTimeline] = useState([]);
  const [patientVault, setPatientVault] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [patientCode, setPatientCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPatients, setIsFetchingPatients] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deletingPatientId, setDeletingPatientId] = useState(null);
  const [requestingAgainLinkId, setRequestingAgainLinkId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [collapsedYears, setCollapsedYears] = useState(new Set());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDateRange, setShowDateRange] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [vaultCategoryFilter, setVaultCategoryFilter] = useState(null);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');

  // showSpinner=false for background polls/focus-refetches — only the
  // very first load should show "Loading patient list...". This is also
  // what makes a pending card's locked→unlocked transition (once the
  // patient accepts) happen without a full-page loading flash: the poll
  // just quietly swaps in the newly-accepted card's full data.
  const fetchPatients = async ({ showSpinner = true } = {}) => {
    if (showSpinner) setIsFetchingPatients(true);
    try {
      const linkedPatients = await getDoctorPatients();
      setPatients(linkedPatients);
    } catch (err) {
      if (showSpinner) setPatients([]);
      // Silent on background poll failures — see DoctorRequests.jsx for
      // the same reasoning: a transient blip shouldn't blank out an
      // already-rendered list every 20s.
    } finally {
      if (showSpinner) setIsFetchingPatients(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  // No websocket/realtime elsewhere in this app (see
  // frontend/src/hooks/usePolling.js for why that wasn't introduced here) —
  // without this, a patient accepting/declining a request, or a doctor
  // sending a new one from another tab, never reflects here until a hard
  // refresh. This is specifically what turns a locked (pending) card into
  // a full unlocked card automatically once the patient responds.
  usePolling(() => fetchPatients({ showSpinner: false }), { intervalMs: 20000 });

  // If a patient's 24h access window lapses while their profile is open,
  // the next poll's refreshed `patients` list will carry linkStatus
  // 'expired' for that card — this closes the open profile the moment that
  // happens, rather than leaving the already-fetched timeline/vault data
  // visible on screen indefinitely just because it was fetched before expiry.
  useEffect(() => {
    if (!selectedPatient) return;
    const updated = patients.find((p) => p.linkId === selectedPatient.linkId);
    if (!updated || (updated.linkStatus && updated.linkStatus !== 'accepted')) {
      setSelectedPatient(null);
    }
  }, [patients]);

  useEffect(() => {
    // Defense in depth: LockedPatientCard never calls setSelectedPatient
    // (no such prop is wired to it), so this branch should be unreachable
    // for a pending/declined patient — but guard it explicitly anyway so a
    // future code path can't accidentally trigger a detail fetch for one.
    if (!selectedPatient || (selectedPatient.linkStatus && selectedPatient.linkStatus !== 'accepted')) {
      setPatientTimeline([]);
      setPatientVault([]);
      return;
    }

    const loadPatientData = async () => {
      if (!token) {
        setPatientTimeline([]);
        setPatientVault([]);
        return;
      }

      setTimelineLoading(true);
      try {
        const patientUserId = selectedPatient.patientUserId || selectedPatient.patientId || selectedPatient.id;
        const [timelineResponse, vaultResponse] = await Promise.all([
          getTimelineReports(token, selectedPatient.email || '', patientUserId),
          getTimelineReports(token, '', patientUserId),
        ]);

        setPatientTimeline(timelineResponse.reports || []);
        setPatientVault(vaultResponse.reports || []);
      } catch (err) {
        setPatientTimeline([]);
        setPatientVault([]);
      } finally {
        setTimelineLoading(false);
      }
    };

    loadPatientData();
  }, [selectedPatient, token]);

  const handleAddPatient = async () => {
    const trimmedId = patientCode.trim();
    if (!trimmedId) { setErrorMessage('Patient code is required.'); setIsLoading(false); return; }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await linkPatientToDoctor(trimmedId);
      const nextPatient = result.patient;

      setPatients((prev) => {
        const alreadyExists = prev.some((patient) => patient.patientUserId === nextPatient.patientUserId || patient.id === nextPatient.id);
        return alreadyExists ? prev : [nextPatient, ...prev];
      });

      setPatientCode("");
      setIsAddPatientOpen(false);
    } catch (err) {
      setErrorMessage(err.message || 'No patient found with that code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePatient = async (patient) => {
    if (!window.confirm(`Are you sure you want to remove ${patient.name} from your patient list?`)) {
      return;
    }

    setDeletingPatientId(patient.patientUserId || patient.id);
    try {
      await deletePatientFromDoctor(
        patient.patientUserId || patient.id,
        patient.linkId
      );
      
      setPatients(patients.filter((p) => p.linkId !== patient.linkId));
      if (selectedPatient?.linkId === patient.linkId) {
        setSelectedPatient(null);
      }
      setOpenMenuId(null);
    } catch (err) {
      console.error('Delete patient error:', err);
      alert('Failed to remove patient. Please try again.');
    } finally {
      setDeletingPatientId(null);
    }
  };

  // Re-sends a request from an expired card — flips the local card to
  // 'pending' immediately rather than waiting for the next 20s poll, same
  // idea as handleAddPatient prepending the new card right away.
  const handleRequestAgain = async (patient) => {
    const patientUserId = patient.patientUserId;
    setRequestingAgainLinkId(patient.linkId);
    try {
      await requestAccessAgain(patientUserId);
      setPatients((prev) =>
        prev.map((p) => (p.linkId === patient.linkId ? { ...p, linkStatus: 'pending' } : p))
      );
    } catch (err) {
      alert(err.message || 'Failed to send request. Please try again.');
    } finally {
      setRequestingAgainLinkId(null);
    }
  };

  const toggleYearCollapsed = (year) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const mapEventToDisplay = (report) => {
    const categoryMeta = {
      'Prescription': { icon: ClipboardList, kind: 'medication' },
      'Prescriptions': { icon: ClipboardList, kind: 'medication' },
      'Lab Report': { icon: FlaskConical, kind: 'lab' },
      'Lab Reports': { icon: FlaskConical, kind: 'lab' },
      'Imaging': { icon: ScanLine, kind: 'imaging' },
      'MRI/Scans': { icon: ScanLine, kind: 'imaging' },
      'Vaccination': { icon: Syringe, kind: 'immunization' },
      'Immunizations': { icon: Syringe, kind: 'immunization' },
      'Consultation': { icon: FileText, kind: 'consultation' },
    };

    const meta = categoryMeta[report.category] || { icon: FileText, kind: 'consultation' };

    return {
      id: report.id,
      title: report.title || report.category || 'Medical Record',
      category: report.category || 'Consultation',
      doctor: report.doctor || 'Unknown doctor',
      hospital: report.hospital || '',
      diagnosis: report.diagnosis || '',
      notes: report.notes || '',
      medicines: report.medicines || '',
      reportDate: report.reportDate,
      displayDate: report.reportDate ? new Date(report.reportDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date',
      icon: meta.icon,
      kind: meta.kind,
      unclearFields: report.unclearFields || [],
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      fileUrl: report.fileUrl,
    };
  };

  const getAvailableCategories = () => {
    const categories = new Set(patientTimeline.map((r) => r.category).filter(Boolean));
    return Array.from(categories).sort();
  };

  const filteredEvents = useMemo(() => {
    let events = patientTimeline.map(mapEventToDisplay);

    if (categoryFilter) {
      events = events.filter((e) => e.category === categoryFilter);
    }

    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      events = events.filter((e) => {
        const eventDate = new Date(e.reportDate);
        return eventDate >= fromDate;
      });
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      events = events.filter((e) => {
        const eventDate = new Date(e.reportDate);
        return eventDate <= toDate;
      });
    }

    // Sort by date descending
    return events.sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
  }, [patientTimeline, categoryFilter, dateFrom, dateTo]);

  // Vault category cards (Prescriptions, Lab Reports, Scans & Imaging, Other Records)
  const VAULT_CATEGORY_CARDS = [
    { title: 'Prescriptions', match: ['Prescription', 'Prescriptions'], icon: ClipboardList },
    { title: 'Lab Reports', match: ['Lab Report', 'Lab Reports'], icon: FlaskConical },
    { title: 'Scans & Imaging', match: ['Imaging', 'MRI/Scans'], icon: ScanLine },
    { title: 'Other Records', match: ['Vaccination', 'Consultation'], icon: FileText },
  ];

  const vaultCategoryCounts = useMemo(() => {
    const counts = VAULT_CATEGORY_CARDS.map(() => 0);
    for (const report of patientVault) {
      const idx = VAULT_CATEGORY_CARDS.findIndex((c) => c.match.includes(report.category));
      if (idx !== -1) counts[idx] += 1;
    }
    return counts;
  }, [patientVault]);

  const filteredVaultReports = useMemo(() => {
    let list = patientVault;

    if (vaultCategoryFilter) {
      const card = VAULT_CATEGORY_CARDS.find((c) => c.title === vaultCategoryFilter);
      if (card) list = list.filter((r) => card.match.includes(r.category));
    }

    const q = vaultSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.title, r.doctor, r.hospital, r.category]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(q))
      );
    }

    return list;
  }, [patientVault, vaultCategoryFilter, vaultSearchQuery]);

  // Calculate active filters count
  const activeFiltersCount = (categoryFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  // Clear all filters
  const handleClearAllFilters = () => {
    setCategoryFilter('');
    setDateFrom('');
    setDateTo('');
    setShowFilterPanel(false);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
          <NotificationBell />
          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-10 lg:px-12 py-8 space-y-8 overflow-x-hidden bg-[#f5f6f8]">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-5xl font-bold tracking-[-0.04em] text-[#1e2432]">Patients</h2>
              <p className="mt-2 text-[1.05rem] text-[#4f586e]">Manage patient records and clinical history.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 relative">
              <button
                type="button"
                onClick={() => setIsAddPatientOpen(true)}
                className="h-11 px-6 rounded-xl bg-[#0c62f2] text-white hover:bg-[#0959e0] transition-colors flex items-center gap-2 shadow-[0_8px_18px_rgba(12,98,242,0.22)] border border-[#0b5ce6]"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span className="font-semibold">New Patient</span>
              </button>
            </div>
          </div>

          {isAddPatientOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
              onClick={() => setIsAddPatientOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50 ">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 ">
                      <span className="material-symbols-outlined text-[22px]">person_add</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 ">Add New Patient</h3>
                      <p className="text-xs text-slate-500 ">Create or link a patient using their patient code</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddPatientOpen(false)}
                    className="p-2 rounded-xl text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-600 mb-2">
                      Patient Code
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">badge</span>
                      <input
                        type="text"
                        value={patientCode}
                        onChange={(e) => {
                          setPatientCode(e.target.value);
                          if (errorMessage) setErrorMessage("");
                        }}
                        placeholder="Enter patient code (e.g., 012345)"
                        className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 focus:border-blue-500 focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 ">
                      {errorMessage}
                    </div>
                  )}

                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 text-xs text-blue-700 ">
                  Use the patient’s existing patient code from the database to link the record.
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl">
                  <button
                    type="button"
                    onClick={() => setIsAddPatientOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddPatient}
                    disabled={!patientCode.trim() || isLoading}
                    className="px-4 py-2.5 rounded-xl bg-[#004ac6] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shadow-sm"
                  >
                    {isLoading ? 'Checking...' : 'Add Patient'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedPatient && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Profile Card */}
              <div className="lg:col-span-1 rounded-[22px] border border-[#dfe5ef] bg-[#dfeaf6] shadow-[0_10px_30px_rgba(19,31,60,0.06)] overflow-hidden">
                  <div className="border-b border-[#d8e1ef] bg-[#dfeaf6] p-6">
                    <div className="flex flex-col items-center text-center gap-4 mb-5">
                      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#2d3a4a] text-[4rem] font-semibold text-white shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)]">
                        {selectedPatient.name ? selectedPatient.name.charAt(0).toUpperCase() : 'P'}
                      </div>
                      <div className="min-w-0 w-full">
                        <h3 className="text-[2.3rem] font-bold tracking-[-0.05em] text-[#1f2a37]">{selectedPatient.name}</h3>
                        <p className="mt-2 text-base text-[#5a6679]">{selectedPatient.email || 'No email'}</p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-[#ddf7ea] px-3 py-1 text-[12px] font-semibold text-[#1d8a57]">
                            Active Patient
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPatient(null)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfd8e5] bg-white px-3 py-2.5 text-sm font-medium text-[#374151] hover:bg-[#f7f9fc] transition-colors shadow-sm"
                    >
                      <XCircle size={14} />
                      Close Profile
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="rounded-xl bg-white/60 p-3 border border-[#ccd9ee]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-slate-500 text-[14px]">badge</span>
                        <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-slate-500">Patient Code</p>
                      </div>
                      <p className="text-[1.05rem] font-semibold text-slate-900 break-all ml-6">{(selectedPatient?.patientId || selectedPatient?.patient_code || selectedPatient?.patientUserId || selectedPatient?.id || '—').replace(/^#/, '')}</p>
                    </div>
                    <div className="rounded-xl bg-white/60 p-3 border border-[#ccd9ee]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-slate-500 text-[14px]">phone</span>
                        <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-slate-500">Phone</p>
                      </div>
                      <p className="text-[1rem] font-semibold text-slate-900 ml-6">{selectedPatient.phone || selectedPatient.patient_phone || '—'}</p>
                    </div>
                    <div className="rounded-xl bg-white/60 p-3 border border-[#ccd9ee]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-slate-500 text-[14px]">wc</span>
                        <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-slate-500">Gender</p>
                      </div>
                      <p className="text-[1rem] font-semibold text-slate-900 ml-6">{selectedPatient.gender || selectedPatient.patient_gender || '—'}</p>
                    </div>
                    <div className="rounded-xl bg-white/60 p-3 border border-[#ccd9ee]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-slate-500 text-[14px]">cake</span>
                        <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-slate-500">Age</p>
                      </div>
                      <p className="text-[1rem] font-semibold text-slate-900 ml-6">{selectedPatient.age || '—'}</p>
                    </div>
                    <div className="rounded-xl bg-white/60 p-3 border border-[#ccd9ee]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-slate-500 text-[14px]">bloodtype</span>
                        <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-slate-500">Blood Type</p>
                      </div>
                      <p className="text-[1rem] font-semibold text-slate-900 ml-6">{selectedPatient.blood_group || selectedPatient.patient_blood_group || '—'}</p>
                    </div>
                    <div className="rounded-xl bg-white/60 p-3 border border-[#ccd9ee]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-slate-500 text-[14px]">event</span>
                        <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-slate-500">DOB</p>
                      </div>
                      <p className="text-[1rem] font-semibold text-slate-900 ml-6">
                        {selectedPatient.dob || selectedPatient.patient_dob ? new Date(selectedPatient.dob || selectedPatient.patient_dob).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    {(selectedPatient.email) && (
                      <div className="rounded-xl bg-[#edf5ff] border border-[#cfe0ff] p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="material-symbols-outlined text-blue-600 text-[14px]">mail</span>
                          <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-blue-600">Email</p>
                        </div>
                        <p className="text-[0.95rem] text-blue-900 break-all ml-6">{selectedPatient.email}</p>
                      </div>
                    )}
                  </div>
                </div>

              {/* Timeline & Vault Content */}
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden flex flex-col max-h-[calc(100vh-200px)]">

              {/* Tabs */}
              <div className="shrink-0 border-b border-slate-200 px-6 py-4 bg-white flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTab('timeline');
                    setVaultSearchQuery('');
                    setVaultCategoryFilter(null);
                  }}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    selectedTab === 'timeline'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50 '
                  }`}
                >
                  Medical Timeline
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTab('vault');
                    setCategoryFilter('');
                    setDateFrom('');
                    setDateTo('');
                  }}
                  className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    selectedTab === 'vault'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50 '
                  }`}
                >
                  Medical Vault
                </button>
              </div>

              {/* Content Area - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6">

              {timelineLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 ">
                  Loading patient data...
                </div>
              ) : selectedTab === 'timeline' ? (
                <div className="space-y-6">
                  {/* Timeline Filter Bar */}
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowDateRange((v) => !v)}
                          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl transition-all duration-200 ${
                            (dateFrom || dateTo) ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-600 bg-slate-50 hover:bg-slate-100 "
                          }`}
                        >
                          <span>
                            {(dateFrom || dateTo)
                              ? `${dateFrom || '...'} → ${dateTo || '...'}`
                              : "All dates"}
                          </span>
                          <ChevronDown size={14} />
                        </button>

                        {showDateRange && (
                          <div className="absolute top-full mt-2 left-0 bg-white rounded-xl border border-slate-200 shadow-lg p-4 z-10 min-w-[300px]">
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-[0.08em]">From</label>
                                <input
                                  type="date"
                                  value={dateFrom}
                                  onChange={(e) => setDateFrom(e.target.value)}
                                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-600 uppercase tracking-[0.08em]">To</label>
                                <input
                                  type="date"
                                  value={dateTo}
                                  onChange={(e) => setDateTo(e.target.value)}
                                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              </div>
                              <div className="flex gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDateFrom('');
                                    setDateTo('');
                                    setShowDateRange(false);
                                  }}
                                  className="flex-1 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowDateRange(false)}
                                  className="flex-1 px-3 py-2 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {getAvailableCategories().length > 0 && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setCategoryFilter(categoryFilter ? '' : getAvailableCategories()[0])}
                            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl transition-all duration-200 ${
                              categoryFilter ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-600 bg-slate-50 hover:bg-slate-100 "
                            }`}
                          >
                            {categoryFilter || "All categories"}
                          </button>

                          {categoryFilter && (
                            <button
                              type="button"
                              onClick={() => setCategoryFilter('')}
                              className="text-slate-400 hover:text-slate-600 text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timeline Infographic */}
                  {patientTimeline.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center">
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full bg-slate-200 ">
                          <span className="material-symbols-outlined text-slate-600 ">calendar_today</span>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-600 ">No medical timeline yet</p>
                      <p className="text-xs text-slate-500 mt-1">Medical records will appear here once added</p>
                    </div>
                  ) : filteredEvents.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center">
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full bg-amber-100 ">
                          <span className="material-symbols-outlined text-amber-600 ">filter_alt_off</span>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-600 ">No entries match this filter</p>
                      <p className="text-xs text-slate-500 mt-1">Try adjusting your date range or category selection</p>
                    </div>
                  ) : (
                    <TimelineInfographic
                      events={filteredEvents}
                      collapsedYears={collapsedYears}
                      onToggleYear={toggleYearCollapsed}
                      onSelectEvent={setSelectedEvent}
                    />
                  )}
                </div>
              ) : selectedTab === 'vault' ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 ">
                      <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500 ">Total Records</p>
                      <p className="mt-3 text-3xl font-bold text-slate-900 ">{patientVault.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 ">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 ">Latest Visit</p>
                      <p className="mt-3 text-base font-semibold text-slate-900 ">
                        {patientVault[0]?.reportDate ? new Date(patientVault[0].reportDate).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 ">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 ">Categories</p>
                      <p className="mt-3 text-base font-semibold text-slate-900 ">
                        {new Set(patientVault.map((item) => item.category || 'Other')).size} types
                      </p>
                    </div>
                  </div>

                  {/* AI Smart Categorization */}
                  {patientVault.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-700 ">AI Smart Categorization</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {VAULT_CATEGORY_CARDS.map((card, idx) => {
                          const Icon = card.icon;
                          const isActive = vaultCategoryFilter === card.title;
                          const count = vaultCategoryCounts[idx] || 0;

                          return (
                            <button
                              key={card.title}
                              type="button"
                              onClick={() => setVaultCategoryFilter(isActive ? null : card.title)}
                              className={`rounded-2xl border-2 p-4 transition-all duration-200 flex flex-col items-center gap-2 ${
                                isActive
                                  ? 'border-blue-500 bg-blue-50 '
                                  : 'border-slate-200 hover:border-blue-200 '
                              }`}
                            >
                              <Icon size={24} className={isActive ? 'text-blue-600 ' : 'text-slate-600 '} />
                              <div className="text-center">
                                <p className={`text-xs font-semibold ${isActive ? 'text-blue-700 ' : 'text-slate-700 '}`}>
                                  {card.title}
                                </p>
                                <p className={`text-[10px] ${isActive ? 'text-blue-600 ' : 'text-slate-500 '}`}>
                                  {count} {count === 1 ? 'record' : 'records'}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Search Bar */}
                  {patientVault.length > 0 && (
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                      <input
                        type="text"
                        placeholder="Search by title, doctor, hospital, or category..."
                        value={vaultSearchQuery}
                        onChange={(e) => setVaultSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  {/* Vault Reports */}
                  {patientVault.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center">
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full bg-slate-200 ">
                          <span className="material-symbols-outlined text-slate-600 ">folder_open</span>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-600 ">Medical vault is empty</p>
                      <p className="text-xs text-slate-500 mt-1">Medical records will appear here once uploaded</p>
                    </div>
                  ) : filteredVaultReports.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-12 text-center">
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full bg-amber-100 ">
                          <span className="material-symbols-outlined text-amber-600 ">search_off</span>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-600 ">No records match your search</p>
                      <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search query</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredVaultReports.map((report) => {
                        const categoryMeta = {
                          'Prescription': { icon: ClipboardList, tone: 'bg-blue-50 text-blue-600 ' },
                          'Prescriptions': { icon: ClipboardList, tone: 'bg-blue-50 text-blue-600 ' },
                          'Lab Report': { icon: FlaskConical, tone: 'bg-orange-50 text-orange-600 ' },
                          'Lab Reports': { icon: FlaskConical, tone: 'bg-orange-50 text-orange-600 ' },
                          'Imaging': { icon: ScanLine, tone: 'bg-slate-100 text-slate-600 ' },
                          'MRI/Scans': { icon: ScanLine, tone: 'bg-slate-100 text-slate-600 ' },
                          'Vaccination': { icon: Syringe, tone: 'bg-slate-100 text-slate-600 ' },
                          'Consultation': { icon: FileText, tone: 'bg-slate-100 text-slate-600 ' },
                        };
                        const meta = categoryMeta[report.category] || categoryMeta.Consultation;
                        const Icon = meta.icon;

                        return (
                          <div key={report.id} className={`rounded-2xl border border-slate-200 p-5 transition-all duration-200 hover:shadow-md ${meta.tone}`}>
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div className="flex items-start gap-4 flex-1 min-w-0">
                                <Icon size={20} className="shrink-0 mt-1" />
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-semibold text-base text-slate-900 line-clamp-2">
                                    {report.title || report.category || 'Medical Record'}
                                  </h4>
                                  <div className="mt-2 space-y-1 text-sm">
                                    {report.doctor && (
                                      <p className="text-slate-600 ">
                                        <span className="font-medium">Doctor:</span> {report.doctor}
                                      </p>
                                    )}
                                    {report.hospital && (
                                      <p className="text-slate-600 ">
                                        <span className="font-medium">Hospital:</span> {report.hospital}
                                      </p>
                                    )}
                                    {report.reportDate && (
                                      <p className="text-slate-600 ">
                                        <span className="font-medium">Date:</span> {new Date(report.reportDate).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>

                                  {report.diagnosis && (
                                    <p className="mt-3 text-sm text-slate-700 ">
                                      <span className="font-medium">Key Finding:</span> {report.diagnosis}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shrink-0">
                                {report.category || 'Record'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
              </div>
            </div>
            </div>
          )}

          {!selectedPatient && (
            <section>
              {isFetchingPatients ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 ">
                  Loading patient list...
                </div>
            ) : patients.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 ">
              No patients linked yet. Add a patient using the patient code.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {patients.map((patient) => {
                  // linkStatus is only present on cards returned for
                  // pending/declined links (backend/db/doctorPatients.js's
                  // minimalDoctorPatientCard) — accepted cards carry no
                  // linkStatus field at all today, so default to
                  // 'accepted' for backward compatibility with any card
                  // shape that predates this field.
                  const linkStatus = patient.linkStatus || 'accepted';
                  if (linkStatus !== 'accepted') {
                    return (
                      <LockedPatientCard
                        key={patient.linkId}
                        patient={patient}
                        linkStatus={linkStatus}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        deletingPatientId={deletingPatientId}
                        onDelete={() => handleDeletePatient(patient)}
                        onRequestAgain={() => handleRequestAgain(patient)}
                        isRequestingAgain={requestingAgainLinkId === patient.linkId}
                      />
                    );
                  }

                  return (
                  <div
                    key={`${patient.patientUserId || patient.id}-${patient.name}`}
                    className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(15,23,42,0.05)] border border-[#c3c6d7]/20 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all"
                    onClick={() => {
                      if (openMenuId === patient.linkId) {
                        setOpenMenuId(null);
                      }
                    }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-4">
                        <img
                          alt="Patient Photo"
                          className="w-14 h-14 rounded-full object-cover border border-[#c3c6d7]/30 "
                          src={patient.avatar}
                        />
                        <div>
                          <h3 className="font-semibold text-lg text-[#191b23] ">{patient.name}</h3>
                          <p className="text-sm text-[#434655] ">
                            ID: {patient.id} • {patient.age} Y • {patient.gender}
                          </p>
                        </div>
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === patient.linkId ? null : patient.linkId);
                          }}
                          className="material-symbols-outlined text-[#737686] cursor-pointer hover:text-[#004ac6] transition-colors"
                        >
                          more_vert
                        </button>
                        {openMenuId === patient.linkId && (
                          <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-slate-200 z-20 min-w-[160px]">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePatient(patient);
                              }}
                              disabled={deletingPatientId === (patient.patientUserId || patient.id)}
                              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <XCircle size={16} />
                              {deletingPatientId === (patient.patientUserId || patient.id) ? 'Removing...' : 'Remove Patient'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#434655] ">Condition</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${patient.conditionTone}`}>
                          {patient.condition}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#434655] ">Last Visit</span>
                        <span className="text-sm font-medium text-[#191b23] ">{patient.lastVisit}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#434655] ">Status</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${patient.statusTone}`}>
                          {patient.status}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedPatient(patient)}
                      className="w-full py-2.5 rounded-lg border border-[#c3c6d7]/60 text-[#434655] hover:bg-[#f3f3fe] hover:text-[#004ac6] hover:border-[#004ac6]/30 transition-all flex justify-center items-center gap-1"
                    >
                      View Profile
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
            </section>
          )}
        </main>
      </div>

      {selectedEvent && (
        <EventDetails
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

/* ==================== Locked Patient Card (pending/declined/expired) ==================== */

// Renders for a link that isn't currently 'accepted'. Deliberately does NOT
// accept an onClick-to-detail handler — there is no prop wiring it to
// setSelectedPatient anywhere, so no detail/timeline/vault/family API
// call can ever fire from this card, matching the requirement that
// clicking a locked card must not trigger a fetch at all. Only the name
// and status badge are rendered; the card's own `patient` prop already
// carries nothing else (see minimalDoctorPatientCard on the backend).
//
// 'expired' is a link that WAS accepted but whose 24h access window has
// passed (see backend/db/doctorPatients.js's isAccessExpired) — shown as
// an inactive/red card with a "Request Access Again" button in place of
// the pending/declined status message.
function LockedPatientCard({ patient, linkStatus, openMenuId, setOpenMenuId, deletingPatientId, onDelete, onRequestAgain, isRequestingAgain }) {
  const isPending = linkStatus === 'pending';
  const isExpired = linkStatus === 'expired';
  const badgeText = isPending ? 'Pending Verification' : isExpired ? 'Inactive' : 'Declined';
  const badgeTone = isPending
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : isExpired
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <div
      className={`rounded-2xl p-6 border transition-all ${
        isPending
          ? 'bg-white border-[#c3c6d7]/20 shadow-[0_4px_12px_rgba(15,23,42,0.05)]'
          : isExpired
          ? 'bg-white border-rose-100 shadow-[0_4px_12px_rgba(15,23,42,0.05)]'
          : 'bg-slate-50 border-slate-200 opacity-70'
      }`}
      onClick={() => {
        if (openMenuId === patient.linkId) setOpenMenuId(null);
      }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center border ${
              isPending
                ? 'bg-amber-50 border-amber-100 text-amber-600'
                : isExpired
                ? 'bg-rose-50 border-rose-100 text-rose-600'
                : 'bg-slate-200 border-slate-300 text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[24px]">
              {isPending ? 'hourglass_top' : isExpired ? 'lock_clock' : 'block'}
            </span>
          </div>
          <div>
            <h3 className={`font-semibold text-lg ${isPending || isExpired ? 'text-[#191b23]' : 'text-slate-500'}`}>
              {patient.patient_name}
            </h3>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeTone}`}>
              {badgeText}
            </span>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(openMenuId === patient.linkId ? null : patient.linkId);
            }}
            className="material-symbols-outlined text-[#737686] cursor-pointer hover:text-[#004ac6] transition-colors"
          >
            more_vert
          </button>
          {openMenuId === patient.linkId && (
            <div className="absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-slate-200 z-20 min-w-[160px]">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={deletingPatientId === patient.patientUserId}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <XCircle size={16} />
                {deletingPatientId === patient.patientUserId ? 'Removing...' : isExpired ? 'Remove Patient' : 'Cancel Request'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isExpired ? (
        <div className="pt-2 border-t border-dashed border-[#c3c6d7]/40 space-y-2">
          <p className="text-sm text-[#737686] text-center">Access expired after 24 hours.</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestAgain();
            }}
            disabled={isRequestingAgain}
            className="w-full py-2.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 transition-all flex justify-center items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRequestingAgain ? 'Sending request...' : 'Request Access Again'}
          </button>
        </div>
      ) : (
        // No "View Profile" button — a pending/declined card is not
        // clickable-through to any detail view. This message replaces it
        // rather than a disabled button, so there's no interactive-looking
        // element that a doctor might expect to do something.
        <p className="text-sm text-[#737686] text-center py-2 border-t border-dashed border-[#c3c6d7]/40">
          {isPending
            ? 'Waiting for patient to accept your request.'
            : 'This patient has declined your request.'}
        </p>
      )}
    </div>
  );
}

/* ==================== Timeline Helper Components ==================== */

function groupEventsByYear(events) {
  const grouped = {};
  events.forEach((event) => {
    const year = event.reportDate ? new Date(event.reportDate).getFullYear() : 'Unknown';
    if (!grouped[year]) {
      grouped[year] = [];
    }
    grouped[year].push(event);
  });

  return Object.entries(grouped)
    .sort(([yearA], [yearB]) => {
      const numA = yearA === 'Unknown' ? -Infinity : parseInt(yearA);
      const numB = yearB === 'Unknown' ? -Infinity : parseInt(yearB);
      return numB - numA;
    })
    .map(([year, events]) => [year === 'Unknown' ? 'Unknown' : parseInt(year), events]);
}

function groupEventsByDate(events) {
  const grouped = {};
  events.forEach((event) => {
    const dateKey = event.displayDate || 'Unknown date';
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(event);
  });

  return Object.entries(grouped)
    .sort(([, eventsA], [, eventsB]) => {
      const dateA = new Date(eventsA[0].reportDate || 0);
      const dateB = new Date(eventsB[0].reportDate || 0);
      return dateB - dateA;
    })
    .map(([, dayEvents]) => dayEvents);
}

function TimelineInfographic({ events, collapsedYears, onToggleYear, onSelectEvent }) {
  const yearGroups = groupEventsByYear(events);

  return (
    <div className="relative pl-4">
      <div className="flex flex-col gap-6">
        {yearGroups.map(([year, yearEvents]) => {
          const collapsed = collapsedYears.has(year);
          return (
            <div key={year} className="flex flex-col gap-6">
              <YearBadge
                year={year}
                count={yearEvents.length}
                collapsed={collapsed}
                onToggle={() => onToggleYear(year)}
              />

              {!collapsed && (
                <div className="flex flex-col gap-8">
                  {groupEventsByDate(yearEvents).map((dayEvents) => (
                    <DayGroup key={dayEvents[0].id} events={dayEvents} onSelectEvent={onSelectEvent} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearBadge({ year, count, collapsed, onToggle }) {
  return (
    <div className="relative flex items-center gap-5">
      <button
        type="button"
        onClick={onToggle}
        className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-700 text-white ring-8 ring-white transition-transform duration-200 hover:scale-110"
        title={collapsed ? `Expand ${year}` : `Collapse ${year}`}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
      </button>

      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-3 rounded-2xl bg-blue-700 px-5 py-2.5 text-white shadow-sm transition-all duration-200 hover:bg-blue-800 hover:shadow-md"
      >
        <span className="text-xl font-bold tracking-tight">{year}</span>
        <span className="text-xs font-medium text-blue-100">
          {count} {count === 1 ? "entry" : "entries"}
        </span>
      </button>
    </div>
  );
}

function DayGroup({ events, onSelectEvent }) {
  const isCluster = events.length > 1;

  return (
    <div className="relative z-10 rounded-2xl bg-slate-50 border border-slate-200 p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-bold text-slate-700 ">{events[0].displayDate}</span>
        {isCluster && (
          <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">
            {events.length} entries
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {events.map((event) => {
          const Icon = event.icon;
          const iconSize = isCluster ? "w-8 h-8 ring-4" : "w-11 h-11 ring-8";
          const dotStyles = {
            lab: "bg-orange-50 text-orange-600 ring-orange-100 ",
            medication: "bg-blue-50 text-blue-600 ring-blue-100 ",
            imaging: "bg-slate-100 text-slate-600 ring-slate-200 ",
            immunization: "bg-slate-100 text-slate-600 ring-slate-200 ",
            consultation: "bg-slate-100 text-slate-600 ring-slate-200 ",
          };

          return (
            <div key={event.id} className="flex items-center gap-4">
              <div
                className={`relative z-10 ${iconSize} shrink-0 rounded-full flex items-center justify-center ring-slate-50 ${dotStyles[event.kind]}`}
              >
                <Icon size={isCluster ? 14 : 18} />
              </div>
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onSelectEvent(event)}>
                <EventCard event={event} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event }) {
  return (
    <div className="group relative flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 transition-all duration-300 ease-out hover:shadow-lg hover:-translate-y-1 hover:border-blue-100 ">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 transition-colors duration-200 group-hover:text-blue-700 ">
            {event.title}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {event.doctor}
            {event.hospital ? ` · ${event.hospital}` : ''}
          </p>

          {event.diagnosis ? (
            <p className="text-sm text-slate-500 mt-2 flex items-start gap-1.5">
              <Sparkles size={13} className="text-blue-500 shrink-0 mt-0.5" />
              <span className="line-clamp-1">{event.diagnosis}</span>
            </p>
          ) : null}
        </div>

        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shrink-0">
          {event.category}
        </span>
      </div>
    </div>
  );
}

function getPreviewType(fileUrl) {
  if (!fileUrl) return null;
  const lower = String(fileUrl).toLowerCase();
  if (/\.pdf(\?|$)/.test(lower)) return 'pdf';
  if (/\.(png|jpe?g|webp)(\?|$)/.test(lower)) return 'image';
  return null;
}

function getPreviewUrl(fileUrl) {
  if (!fileUrl) return null;
  const apiBase = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`;

  try {
    const parsed = new URL(fileUrl);
    return fileUrl;
  } catch (e) {
    return `${apiBase}/reports/signed-url?path=${encodeURIComponent(fileUrl)}`;
  }
}

function EventDetails({ event, onClose }) {
  const formattedDate = event.reportDate
    ? new Date(event.reportDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown date';

  const previewType = getPreviewType(event.fileUrl);
  const previewUrl = getPreviewUrl(event.fileUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600 ">
              {event.category}
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900 ">
              {event.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500 ">
              {formattedDate} · {event.hospital || 'Medical Record'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-slate-50 p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 "
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {event.doctor && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">Doctor</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 ">{event.doctor}</p>
                </div>
              )}

              {event.category && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">Category</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 ">{event.category}</p>
                </div>
              )}

              {event.diagnosis && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">{categoryFieldLabels(event.category).diagnosis}</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 ">{event.diagnosis}</p>
                </div>
              )}

              {event.medicines && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500 ">{categoryFieldLabels(event.category).medicines}</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 whitespace-pre-line">{event.medicines}</p>
                </div>
              )}
            </div>

            {event.notes && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500 ">Notes</p>
                <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{event.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {event.fileUrl ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 h-full flex flex-col">
                <p className="text-sm text-slate-500 ">Document preview</p>
                {previewType === 'pdf' ? (
                  <iframe
                    src={previewUrl}
                    title="PDF preview"
                    className="mt-3 flex-1 w-full rounded-xl border border-slate-200 "
                    style={{ minHeight: 420 }}
                  />
                ) : previewType === 'image' ? (
                  <img
                    src={previewUrl}
                    alt={event.title || 'Uploaded document'}
                    className="mt-3 max-h-[520px] w-full rounded-xl object-contain"
                  />
                ) : (
                  <p className="mt-3 text-sm text-slate-500 ">Preview not available for this file type.</p>
                )}

                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-blue-700 text-sm font-semibold transition-colors hover:bg-blue-100 "
                >
                  <FileText size={16} />
                  View original document
                </a>
              </div>
            ) : event.fileName ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500 ">Attached file</p>
                <p className="mt-2 text-sm font-semibold text-slate-900 break-all">{event.fileName}</p>
                <p className="mt-1 text-xs text-slate-400 ">Original document not stored yet — filename only.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm text-slate-500 ">No document attached</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
