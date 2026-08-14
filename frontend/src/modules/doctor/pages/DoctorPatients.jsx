import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import DoctorSidebar from "../components/DoctorSidebar";
import ThemeToggle from "../../../components/Common/ThemeToggle";
import ProfileDropdown from "../../settings/components/ProfileDropdown";

const patientCards = [
  {
    name: "Robert Chen",
    id: "#PT-8472",
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
              <h2 className="text-5xl font-bold tracking-tight text-[#191b23] dark:text-slate-100">Patients</h2>
              <p className="mt-1 text-lg text-[#434655] dark:text-slate-300">Manage patient records and clinical history.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="h-11 px-6 rounded-lg border border-[#c3c6d7] dark:border-slate-700 text-[#191b23] dark:text-slate-100 hover:bg-[#f3f3fe] dark:hover:bg-slate-800 transition-colors flex items-center gap-2 bg-white dark:bg-slate-900 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                Filter
              </button>
              <button
                type="button"
                className="h-11 px-6 rounded-lg bg-[#004ac6] dark:bg-blue-600 text-white hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm border-t border-white/20"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                New Patient
              </button>
            </div>
          </div>

          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {patientCards.map((patient) => (
                <div
                  key={patient.id}
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
                    <span className="material-symbols-outlined text-[#737686] dark:text-slate-400 cursor-pointer hover:text-[#004ac6] dark:hover:text-blue-400 transition-colors">more_vert</span>
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
                    className="w-full py-2.5 rounded-lg border border-[#c3c6d7]/60 dark:border-slate-700 text-[#434655] dark:text-slate-300 hover:bg-[#f3f3fe] dark:hover:bg-slate-800 hover:text-[#004ac6] dark:hover:text-blue-400 hover:border-[#004ac6]/30 dark:hover:border-blue-500/30 transition-all flex justify-center items-center gap-1"
                  >
                    View Profile
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
