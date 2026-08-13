import React from "react";
import DoctorSidebar from "../components/DoctorSidebar";

const patientCards = [
  {
    name: "Robert Chen",
    id: "#PT-8472",
    age: 45,
    gender: "M",
    condition: "Hypertension Management",
    conditionTone: "bg-[#dbeafe] text-[#1d4ed8]",
    lastVisit: "2 days ago",
    status: "Stable",
    statusTone: "bg-emerald-100 text-emerald-800",
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuB45KB3Px91UbuJvRUdhoWXIdXqG-T8yEvWSonSthiAHmHbM0iNuNn5XmuVB_P1gKI-shxRcfFoHeIwqVdc_UQMKADLpfGH82DYTcb5UgU-etAVJA70qrI8aQ89AIi3OcX0ohnpiV1fDFuGKD0FPY1UyaobKAC4pt8YtP3UjC7wLtSKcQTqM0edYXk-ayQFS2AIZO4YlQc9n2exYT99Yrpm-pwSvF2zL7x-h5WGt9u9ESFmEeYx_Qyi",
  },
  {
    name: "Sarah Jenkins",
    id: "#PT-9381",
    age: 68,
    gender: "F",
    condition: "Type 2 Diabetes",
    conditionTone: "bg-[#dbeafe] text-[#1d4ed8]",
    lastVisit: "1 week ago",
    status: "Review Needed",
    statusTone: "bg-amber-100 text-amber-800",
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCXa3AXOi9J0z9ky4_JxEZL0hhOqSSDXnodn9crBFq2N7mxg3vXtIFGFuf45gsudAqYfv2QeuMDBirjepGdYpWd_sxEFmj_OWUAOGfPJM-Zwdmh_DbLUr8aAMx1p6L9HPE3Y34i-qWFWBG6q-QWe1tH7jO7m_ttxbnNeUoMz_EcnqrpzeN50vPD5ppte43SfPsu37t0yHb630Wwb1aQPCGk_CrxRFtyG8KKgDDBwBFAa0ZqlzD0OZma",
  },
  {
    name: "Marcus Thorne",
    id: "#PT-1045",
    age: 28,
    gender: "M",
    condition: "Post-Op Rehab",
    conditionTone: "bg-[#dbeafe] text-[#1d4ed8]",
    lastVisit: "Today",
    status: "Improving",
    statusTone: "bg-emerald-100 text-emerald-800",
    avatar:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC1Mhi9JaOT9dZw1okjE3aWuH9JW2tYQeUkfW9DzFrt_H1Wvv_RSkpHJVrjG7oVtDNeCLNRccdHkp3_YVxR4cqIOT0WOttd1pq_FM_LBx_NQp1SR3-D4eWgeSET3NB7YQ3qROD8sPlLCI8D1FVHcvzzbREzAN1_4WpxPxXM9T8d42exy6jLatFtNJgrTnngu6uRq4AfMQrZ2VSLp_FXBDcQ8bgC2z9akZmijfqccrlvfShOGBx-k3I7",
  },
];

export default function DoctorPatients() {
  return (
    <div className="min-h-screen bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-[#faf8ff]/80 backdrop-blur-md sticky top-0 z-40 flex justify-between items-center px-6 h-16 w-full border-b border-[#c3c6d7]/40 shadow-sm">
          <div className="flex items-center gap-3 lg:hidden">
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-2xl font-extrabold text-[#004ac6] tracking-tight">Swastha</span>
          </div>

          <div className="hidden lg:flex flex-1 max-w-xl relative ml-8">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]">search</span>
            <input
              className="w-full h-11 pl-11 pr-3 rounded-full bg-[#f3f3fe] border border-[#c3c6d7]/80 focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/20 transition-all text-sm"
              placeholder="Search patients, conditions, IDs..."
              type="text"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">help</span>
            </button>
            <button
              type="button"
              className="ml-2 w-10 h-10 rounded-full overflow-hidden border-2 border-[#e7e7f3] hover:border-[#004ac6] transition-colors"
            >
              <img
                alt="Dr. Smith"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBF9BBTBsXIDKTgXMwGA1BkAmn04pCYhgsOiJDEngguRroSoqct4IOIAQDDbY7Dnd-Y4IivCbYF1fgbx34LnIXyc1gVg_9mcCESfPE4fmftbITogRkW2scodNuCzpokrIFX0ccfqdtjx3lWdppPDkFnRR31pZw1LUnLLIn_eU2G09BbIsC-eClq98ynxE9YJirdJVSERFBDZlE-I6Iwk-fipEjXe4gsdz4t6YolZ8JS7aHxYYeQi550"
              />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-10 lg:px-12 py-8 space-y-8 overflow-x-hidden">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-5xl font-bold tracking-tight text-[#191b23]">Patients</h2>
              <p className="mt-1 text-lg text-[#434655]">Manage patient records and clinical history.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="h-11 px-6 rounded-lg border border-[#c3c6d7] text-[#191b23] hover:bg-[#f3f3fe] transition-colors flex items-center gap-2 bg-white shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                Filter
              </button>
              <button
                type="button"
                className="h-11 px-6 rounded-lg bg-[#004ac6] text-white hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm border-t border-white/20"
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
                  className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(15,23,42,0.05)] border border-[#c3c6d7]/20 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                      <img
                        alt="Patient Photo"
                        className="w-14 h-14 rounded-full object-cover border border-[#c3c6d7]/30"
                        src={patient.avatar}
                      />
                      <div>
                        <h3 className="font-semibold text-lg text-[#191b23]">{patient.name}</h3>
                        <p className="text-sm text-[#434655]">
                          ID: {patient.id} • {patient.age} Y • {patient.gender}
                        </p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[#737686] cursor-pointer hover:text-[#004ac6] transition-colors">more_vert</span>
                  </div>

                  <div className="space-y-2 mb-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#434655]">Condition</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${patient.conditionTone}`}>
                        {patient.condition}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#434655]">Last Visit</span>
                      <span className="text-sm font-medium text-[#191b23]">{patient.lastVisit}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#434655]">Status</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${patient.statusTone}`}>
                        {patient.status}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="w-full py-2.5 rounded-lg border border-[#c3c6d7]/60 text-[#434655] hover:bg-[#f3f3fe] hover:text-[#004ac6] hover:border-[#004ac6]/30 transition-all flex justify-center items-center gap-1"
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
