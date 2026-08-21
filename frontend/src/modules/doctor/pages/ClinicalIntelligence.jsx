import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Search, ChevronDown, User } from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import { getDoctorPatients } from "../../../services/doctorPatients";

// NOTE: vitals/glucose/recovery, alerts timeline, and the weekly trend
// chart below are still mock/placeholder data — swap for real per-patient
// data once there's a backend endpoint for it. The patient picker itself
// is wired to real linked patients via getDoctorPatients().
const timeline = [
  { title: "Medication review recommended", time: "08:45 AM", detail: "Insulin schedule adjusted for better compliance." },
  { title: "Lab follow-up due", time: "Yesterday", detail: "HbA1c follow-up due by Thursday." },
  { title: "AI alert: blood pressure trend", time: "Mon", detail: "Systolic readings trending upward over 3 days." },
];

export default function ClinicalIntelligence() {
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [isFetchingPatients, setIsFetchingPatients] = useState(true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const pickerRef = useRef(null);

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

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
          <button
            type="button"
            onClick={() => navigate('/doctor/clinical-intelligence')}
            className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600 "
          >
            <Sparkles size={16} />
            Ask Swastha about your health records...
          </button>

          <NotificationBell />
          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#004ac6] ">Clinical intelligence</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight ">Patient Profile & AI Assistant</h2>
            </div>
            <button
              type="button"
              disabled={!selectedPatient}
              className="inline-flex items-center gap-2 bg-[#004ac6] text-white px-5 py-3 rounded-xl shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
              Generate summary
            </button>
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
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-sm text-[#434655] ">Patient overview</p>
                    <h3 className="text-2xl font-bold ">{patientName}</h3>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">Stable</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#f3f3fe] rounded-xl p-4">
                    <p className="text-sm text-[#434655] ">Baseline vitals</p>
                    <div className="mt-3 text-3xl font-bold ">120/80</div>
                    <div className="text-sm text-[#434655] ">BP avg</div>
                  </div>
                  <div className="bg-[#f3f3fe] rounded-xl p-4">
                    <p className="text-sm text-[#434655] ">Glucose</p>
                    <div className="mt-3 text-3xl font-bold ">98</div>
                    <div className="text-sm text-[#434655] ">mg/dL</div>
                  </div>
                  <div className="bg-[#f3f3fe] rounded-xl p-4">
                    <p className="text-sm text-[#434655] ">Recovery</p>
                    <div className="mt-3 text-3xl font-bold ">91%</div>
                    <div className="text-sm text-[#434655] ">progress</div>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
                <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold ">Recent AI alerts</h3>
                    <button type="button" className="text-sm text-[#004ac6] font-semibold">View all</button>
                  </div>
                  <div className="space-y-3">
                    {timeline.map((item) => (
                      <div key={item.title} className="flex gap-3 rounded-xl bg-[#f3f3fe] p-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#004ac6] mt-2" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold ">{item.title}</p>
                            <span className="text-xs text-[#434655] ">{item.time}</span>
                          </div>
                          <p className="mt-1 text-sm text-[#434655] ">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold ">Health trend overview</h3>
                    <span className="text-sm text-[#434655] ">Last 30 days</span>
                  </div>

                  <div className="h-56 flex items-end gap-4 px-2 pt-4">
                    {[42, 65, 58, 70, 80, 75, 92].map((value, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center gap-3">
                        <div className="w-full rounded-t-xl bg-gradient-to-t from-[#004ac6] via-[#2563eb] to-[#39b8fd] " style={{ height: `${value}%` }} />
                        <span className="text-xs text-[#434655] ">{["M","T","W","T","F","S","S"][index]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}