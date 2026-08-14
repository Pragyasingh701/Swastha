import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import DoctorSidebar from "../components/DoctorSidebar";
import ThemeToggle from "../../../components/Common/ThemeToggle";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import { useAuth } from "../../../context/AuthContext";
import * as reportService from "../../../api/reports";
import { authService } from "../../../services/auth";

const seedPatients = [
  {
    name: "Robert Chen",
    id: "#PT-8472",
    email: "robert.chen@example.com",
    age: 45,
    gender: "M",
    condition: "Hypertension Management",
    conditionTone: "bg-[#dbeafe] dark:bg-blue-500/10 text-[#1d4ed8] dark:text-blue-400",
    lastVisit: "2 days ago",
    status: "Stable",
    statusTone: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400",
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuB45KB3Px91UbuJvRUdhoWXIdXqG-T8yEvWSonSthiAHmHbM0iNuNn5XmuVB_P1gKI-shxRcfFoHeIwqVdc_UQMKADLpfGH82DYTcb5UgU-etAVJA70qrI8aQ89AIi3OcX0ohnpiV1fDFuGKD0FPY1UyaobKAC4pt8YtP3UjC7wLtSKcQTqM0edYXk-ayQFS2AIZO4YlQc9n2exYT99Yrpm-pwSvF2zL7x-h5WGt9u9ESFmEeYx_Qyi",
  },
  {
    name: "Sarah Jenkins",
    id: "#PT-9381",
    email: "sarah.jenkins@example.com",
    age: 68,
    gender: "F",
    condition: "Type 2 Diabetes",
    conditionTone: "bg-[#dbeafe] dark:bg-blue-500/10 text-[#1d4ed8] dark:text-blue-400",
    lastVisit: "1 week ago",
    status: "Review Needed",
    statusTone: "bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400",
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCXa3AXOi9J0z9ky4_JxEZL0hhOqSSDXnodn9crBFq2N7mxg3vXtIFGFuf45gsudAqYfv2QeuMDBirjepGdYpWd_sxEFmj_OWUAOGfPJM-Zwdmh_DbLUr8aAMx1p6L9HPE3Y34i-qWFWBG6q-QWe1tH7jO7m_ttxbnNeUoMz_EcnqrpzeN50vPD5ppte43SfPsu37t0yHb630Wwb1aQPCGk_CrxRFtyG8KKgDDBwBFAa0ZqlzD0OZma",
  },
  {
    name: "Marcus Thorne",
    id: "#PT-1045",
    email: "marcus.thorne@example.com",
    age: 28,
    gender: "M",
    condition: "Post-Op Rehab",
    conditionTone: "bg-[#dbeafe] dark:bg-blue-500/10 text-[#1d4ed8] dark:text-blue-400",
    lastVisit: "Today",
    status: "Improving",
    statusTone: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400",
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC1Mhi9JaOT9dZw1okjE3aWuH9JW2tYQeUkfW9DzFrt_H1Wvv_RSkpHJVrjG7oVtDNeCLNRccdHkp3_YVxR4cqIOT0WOttd1pq_FM_LBx_NQp1SR3-D4eWgeSET3NB7YQ3qROD8sPlLCI8D1FVHcvzzbREzAN1_4WpxPxXM9T8d42exy6jLatFtNJgrTnngu6uRq4AfMQrZ2VSLp_FXBDcQ8bgC2z9akZmijfqccrlvfShOGBx-k3I7",
  },
];

export default function DoctorPatients() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [patientCards, setPatientCards] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    patientCode: '',
    dob: '',
    gender: 'male',
    bloodGroup: '',
  });
  const [submittingPatient, setSubmittingPatient] = useState(false);
  const [patientError, setPatientError] = useState('');
  const [patientSuccess, setPatientSuccess] = useState('');

  useEffect(() => {
    const loadPatients = async () => {
      if (!token) {
        setPatientCards([]);
        return;
      }

      try {
        const profiles = await authService.getPatients(token);
        const normalized = profiles.map((profile) => ({
          ...profile,
          name: profile.full_name || profile.name || 'Patient',
          id: profile.patient_code || profile.patientCode || '#PT-0000',
          email: profile.email || profile.user_email || '',
          age: profile.dob ? Math.max(0, new Date().getFullYear() - new Date(profile.dob).getFullYear()) : 0,
          gender: (profile.gender || 'M').charAt(0).toUpperCase(),
          condition: 'Active Patient',
          conditionTone: 'bg-[#dbeafe] dark:bg-blue-500/10 text-[#1d4ed8] dark:text-blue-400',
          lastVisit: profile.last_visit_at ? 'Recent' : 'New',
          status: 'Active',
          statusTone: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
        }));

        setPatientCards(normalized);
      } catch (error) {
        console.warn('Failed to load patient profiles:', error.message);
        setPatientCards([]);
      }
    };

    loadPatients();
  }, [token]);

  useEffect(() => {
    if (!selectedPatient?.email || !token) {
      setTimelineEvents([]);
      return;
    }

    let isMounted = true;
    setLoadingTimeline(true);

    reportService.getTimelineReports(token, selectedPatient.email)
      .then((response) => {
        if (!isMounted) return;
        const reports = Array.isArray(response?.reports) ? response.reports : [];
        setTimelineEvents(reports.sort((a, b) => new Date(b.reportDate || b.date || b.created_at || 0) - new Date(a.reportDate || a.date || a.created_at || 0)));
      })
      .catch((err) => {
        console.error('Failed to load patient timeline:', err);
        if (isMounted) setTimelineEvents([]);
      })
      .finally(() => {
        if (isMounted) setLoadingTimeline(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedPatient, token]);

  const handleViewProfile = (patient) => {
    setSelectedPatient(patient);
  };

  const handleDeletePatient = async (patient) => {
    const targetUserId = patient.user_id || patient.userId || null;

    try {
      if (targetUserId && token) {
        await authService.deletePatient(targetUserId, token);
      }

      setPatientCards((prev) => prev.filter((item) => {
        const samePatient = (item.email || '') === (patient.email || '') && (item.id || '') === (patient.id || '');
        return !samePatient;
      }));

      if (selectedPatient && (selectedPatient.email || '') === (patient.email || '') && (selectedPatient.id || '') === (patient.id || '')) {
        setSelectedPatient(null);
        setTimelineEvents([]);
      }

      setPatientSuccess('Patient deleted successfully.');
      setMenuOpenFor(null);
    } catch (error) {
      console.error('Delete patient failed:', error);
      setPatientError(error.message || 'Failed to delete patient from database.');
      setMenuOpenFor(null);
    }
  };

  const handleNewPatientSubmit = async (event) => {
    event.preventDefault();
    setPatientError('');
    setPatientSuccess('');

    const fullName = newPatientForm.fullName.trim();
    const email = newPatientForm.email.trim();
    const phone = newPatientForm.phone.trim();
    const patientCode = newPatientForm.patientCode.trim();

    if (!fullName || !email || !phone || !patientCode) {
      setPatientError('Name, email, phone, and patient code are required.');
      return;
    }

    if (!/^\d{6}$/.test(patientCode)) {
      setPatientError('Patient code must be a 6-digit number.');
      return;
    }

    try {
      setSubmittingPatient(true);
      const patientRecord = await authService.getPatientByCode(patientCode);
      const matchedPatient = patientRecord || null;

      if (!matchedPatient || matchedPatient.role !== 'patient') {
        throw new Error('No patient account was found for this patient code in the user database.');
      }

      const normalizedEmail = (matchedPatient.email || email).toLowerCase();
      const patientDob = matchedPatient.dob || newPatientForm.dob || null;
      const age = patientDob ? Math.max(0, new Date().getFullYear() - new Date(patientDob).getFullYear()) : 0;

      const savedProfile = await authService.createPatientProfile({
        user_id: matchedPatient.id,
        patient_code: patientCode,
        full_name: matchedPatient.name || fullName,
        dob: patientDob,
        gender: matchedPatient.gender || newPatientForm.gender,
        blood_group: matchedPatient.blood_group || matchedPatient.bloodGroup || newPatientForm.bloodGroup,
        phone: matchedPatient.phone || matchedPatient.mobile || phone,
        emergency_contact: fullName,
        medical_notes: `${fullName} linked via patient code ${patientCode}`,
      }, token);

      const createdPatient = {
        ...savedProfile,
        name: savedProfile.full_name || matchedPatient.name || fullName,
        id: savedProfile.patient_code || matchedPatient.patient_code || matchedPatient.patientCode || `#PT-${Math.floor(1000 + Math.random() * 9000)}`,
        email: normalizedEmail,
        age,
        gender: (savedProfile.gender || matchedPatient.gender || newPatientForm.gender || 'male').charAt(0).toUpperCase(),
        condition: 'Existing Patient',
        conditionTone: 'bg-[#dbeafe] dark:bg-blue-500/10 text-[#1d4ed8] dark:text-blue-400',
        lastVisit: 'Synced',
        status: 'Active',
        statusTone: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400',
        avatar: matchedPatient.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
      };

      setPatientCards((prev) => {
        const exists = prev.some((item) => (item.email || '').toLowerCase() === normalizedEmail);
        if (exists) return prev;
        return [createdPatient, ...prev];
      });

      setSelectedPatient(createdPatient);
      setNewPatientForm({
        fullName: '',
        email: '',
        phone: '',
        patientCode: '',
        dob: '',
        gender: 'male',
        bloodGroup: '',
      });
      setShowNewPatientModal(false);
      setPatientSuccess('Patient found and saved to patient_profiles successfully.');
    } catch (err) {
      setPatientError(err.message || 'Failed to find patient in database.');
    } finally {
      setSubmittingPatient(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] dark:bg-slate-950 text-[#191b23] dark:text-slate-100 antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="flex-1 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-400 dark:text-slate-500 transition-colors hover:border-blue-300 dark:hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <Sparkles size={16} />
            Ask Swastha about your health records...
          </button>

          <button className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0">
            <Bell size={20} className="text-slate-600 dark:text-slate-300" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          <ThemeToggle />

          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-10 lg:px-12 py-8 space-y-8 overflow-x-hidden">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-5xl font-bold tracking-tight text-[#191b23] dark:text-slate-100">
                {selectedPatient ? "Patient Timeline" : "Patients"}
              </h2>
              <p className="mt-1 text-lg text-[#434655] dark:text-slate-300">
                {selectedPatient
                  ? `Viewing full timeline for ${selectedPatient.name}.`
                  : 'Manage patient records and clinical history.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!selectedPatient && (
                <button
                  type="button"
                  onClick={() => setShowNewPatientModal(true)}
                  className="h-11 px-6 rounded-lg bg-[#004ac6] dark:bg-blue-600 text-white hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm border-t border-white/20"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  New Patient
                </button>
              )}

              {selectedPatient && (
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="h-11 px-6 rounded-lg border border-[#c3c6d7] dark:border-slate-700 text-[#191b23] dark:text-slate-100 hover:bg-[#f3f3fe] dark:hover:bg-slate-800 transition-colors flex items-center gap-2 bg-white dark:bg-slate-900 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back to patients
                </button>
              )}
            </div>
          </div>

          {patientSuccess && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              {patientSuccess}
            </div>
          )}

          {selectedPatient ? (
            <section className="bg-white dark:bg-slate-900 rounded-2xl border border-[#c3c6d7]/20 dark:border-slate-800 shadow-[0_4px_12px_rgba(15,23,42,0.05)] dark:shadow-black/30 p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                  <img
                    alt="Selected patient"
                    className="w-16 h-16 rounded-full object-cover border border-[#c3c6d7]/30 dark:border-slate-700"
                    src={selectedPatient.avatar}
                  />
                  <div>
                    <h3 className="text-2xl font-bold text-[#191b23] dark:text-slate-100">{selectedPatient.name}</h3>
                    <p className="text-sm text-[#434655] dark:text-slate-300">
                      ID: {selectedPatient.id} • {selectedPatient.age} Y • {selectedPatient.gender} • {selectedPatient.email}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${selectedPatient.statusTone}`}>
                  {selectedPatient.status}
                </span>
              </div>

              <div className="pt-6">
                {loadingTimeline ? (
                  <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
                    Loading patient timeline...
                  </div>
                ) : timelineEvents.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-8 text-center text-slate-500 dark:text-slate-400">
                    No timeline entries found for this patient.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {timelineEvents.map((event) => {
                      const date = new Date(event.reportDate || event.date || event.created_at || Date.now());
                      const dateLabel = Number.isNaN(date.getTime()) ? 'Undated' : date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      });

                      return (
                        <div key={event.id} className="relative pl-7 before:absolute before:left-2 before:top-2 before:h-full before:w-px before:bg-slate-200 dark:before:bg-slate-700">
                          <div className="absolute left-0 top-2 h-4 w-4 rounded-full border-4 border-white dark:border-slate-900 bg-[#004ac6]" />
                          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#004ac6] dark:text-blue-400">
                                  {event.category || 'Record'}
                                </p>
                                <h4 className="mt-1 text-lg font-semibold text-[#191b23] dark:text-slate-100">
                                  {event.title || 'Medical Record'}
                                </h4>
                              </div>
                              <span className="text-sm text-slate-500 dark:text-slate-400">{dateLabel}</span>
                            </div>

                            {(event.doctor || event.hospital) && (
                              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                                {event.doctor ? `${event.doctor}` : ''}
                                {event.doctor && event.hospital ? ' • ' : ''}
                                {event.hospital || ''}
                              </p>
                            )}

                            {(event.diagnosis || event.medicines || event.notes || event.analysis) && (
                              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                                {event.diagnosis && <p><span className="font-semibold text-[#191b23] dark:text-slate-100">Diagnosis:</span> {event.diagnosis}</p>}
                                {event.medicines && <p><span className="font-semibold text-[#191b23] dark:text-slate-100">Medicines:</span> {event.medicines}</p>}
                                {event.notes && <p><span className="font-semibold text-[#191b23] dark:text-slate-100">Notes:</span> {event.notes}</p>}
                                {event.analysis && <p><span className="font-semibold text-[#191b23] dark:text-slate-100">AI Summary:</span> {event.analysis}</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {patientCards.map((patient) => {
                  const patientKey = `${patient.email || 'patient'}-${patient.id || 'unknown'}`;
                  return (
                    <div
                      key={patientKey}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-[0_4px_12px_rgba(15,23,42,0.05)] dark:shadow-black/30 border border-[#c3c6d7]/20 dark:border-slate-800 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                          <img
                            alt="Patient Photo"
                            className="w-14 h-14 rounded-full object-cover border border-[#c3c6d7]/30 dark:border-slate-700"
                            src={patient.avatar}
                          />
                          <div>
                            <h3 className="font-semibold text-lg text-[#191b23] dark:text-slate-100">{patient.name}</h3>
                            <p className="text-sm text-[#434655] dark:text-slate-300">
                              ID: {patient.id} • {patient.age} Y • {patient.gender}
                            </p>
                          </div>
                        </div>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setMenuOpenFor(menuOpenFor === patientKey ? null : patientKey)}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            aria-label="Patient actions"
                          >
                            <span className="material-symbols-outlined text-[#737686] dark:text-slate-400 cursor-pointer hover:text-[#004ac6] dark:hover:text-blue-400 transition-colors">more_vert</span>
                          </button>

                          {menuOpenFor === patientKey && (
                            <div className="absolute right-0 top-11 z-10 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleDeletePatient(patient)}
                                className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              >
                                Delete Patient
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                    <div className="space-y-2 mb-6">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#434655] dark:text-slate-300">Condition</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${patient.conditionTone}`}>
                          {patient.condition}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#434655] dark:text-slate-300">Last Visit</span>
                        <span className="text-sm font-medium text-[#191b23] dark:text-slate-100">{patient.lastVisit}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[#434655] dark:text-slate-300">Status</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${patient.statusTone}`}>
                          {patient.status}
                        </span>
                      </div>
                    </div>

                      <button
                        type="button"
                        onClick={() => handleViewProfile(patient)}
                        className="w-full py-2.5 rounded-lg border border-[#c3c6d7]/60 dark:border-slate-700 text-[#434655] dark:text-slate-300 hover:bg-[#f3f3fe] dark:hover:bg-slate-800 hover:text-[#004ac6] dark:hover:text-blue-400 hover:border-[#004ac6]/30 dark:hover:border-blue-500/30 transition-all flex justify-center items-center gap-1"
                      >
                        View Profile
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {showNewPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] dark:text-blue-400 font-medium">New patient</p>
                <h3 className="mt-2 text-2xl font-bold text-[#191b23] dark:text-slate-100">Add patient details</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowNewPatientModal(false);
                  setPatientError('');
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleNewPatientSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Full Name
                  <input
                    type="text"
                    value={newPatientForm.fullName}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none focus:border-[#004ac6] dark:focus:border-blue-500"
                    placeholder="John Smith"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Email
                  <input
                    type="email"
                    value={newPatientForm.email}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none focus:border-[#004ac6] dark:focus:border-blue-500"
                    placeholder="patient@example.com"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Phone
                  <input
                    type="tel"
                    value={newPatientForm.phone}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none focus:border-[#004ac6] dark:focus:border-blue-500"
                    placeholder="+91 98765 43210"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Patient Code
                  <input
                    type="text"
                    value={newPatientForm.patientCode}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, patientCode: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none focus:border-[#004ac6] dark:focus:border-blue-500"
                    placeholder="123456"
                    required
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  DOB
                  <input
                    type="date"
                    value={newPatientForm.dob}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, dob: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none focus:border-[#004ac6] dark:focus:border-blue-500"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Gender
                  <select
                    value={newPatientForm.gender}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, gender: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none focus:border-[#004ac6] dark:focus:border-blue-500"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Blood Group
                  <input
                    type="text"
                    value={newPatientForm.bloodGroup}
                    onChange={(e) => setNewPatientForm((prev) => ({ ...prev, bloodGroup: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-slate-900 dark:text-slate-100 outline-none focus:border-[#004ac6] dark:focus:border-blue-500"
                    placeholder="O+"
                  />
                </label>
              </div>

              {patientError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  {patientError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewPatientModal(false);
                    setPatientError('');
                  }}
                  className="h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPatient}
                  className="h-11 px-5 rounded-xl bg-[#004ac6] dark:bg-blue-600 text-white hover:opacity-90 disabled:opacity-60"
                >
                  {submittingPatient ? 'Saving...' : 'Create Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
