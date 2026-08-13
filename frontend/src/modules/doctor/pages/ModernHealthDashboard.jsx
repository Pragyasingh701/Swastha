import React from "react";
import DoctorSidebar from "../components/DoctorSidebar";

const metrics = [
  { label: "Visits today", value: "146", detail: "+12% vs yesterday", tone: "bg-blue-50 text-blue-700" },
  { label: "Critical alerts", value: "07", detail: "3 new this morning", tone: "bg-orange-50 text-orange-700" },
  { label: "Discharge rate", value: "84%", detail: "+4.3% effiency", tone: "bg-emerald-50 text-emerald-700" },
  { label: "Bed occupancy", value: "68%", detail: "Normal operating", tone: "bg-violet-50 text-violet-700" },
];

const patientQueue = [
  { name: "Aisha Patel", time: "09:30 AM", status: "Consultation", tint: "bg-blue-100 text-blue-700" },
  { name: "Milo Grant", time: "10:15 AM", status: "Lab Review", tint: "bg-violet-100 text-violet-700" },
  { name: "Ibrahim Ali", time: "11:00 AM", status: "Follow-up", tint: "bg-emerald-100 text-emerald-700" },
];

const careList = [
  { name: "Robert Chen", status: "Improving", detail: "BP trending down", badge: "bg-emerald-100 text-emerald-700" },
  { name: "Sarah Jenkins", status: "Review", detail: "HbA1c check due", badge: "bg-amber-100 text-amber-700" },
  { name: "Marcus Thorne", status: "Stable", detail: "Mobility improved", badge: "bg-blue-100 text-blue-700" },
];

export default function ModernHealthDashboard() {
  return (
    <div className="min-h-screen bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-[#faf8ff]/80 border-b border-[#c3c6d7]/40 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-xl font-bold text-[#004ac6]">Swastha</span>
          </div>

          <div className="hidden lg:flex flex-1 max-w-xl relative ml-6">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]">search</span>
            <input type="text" className="w-full h-11 pl-11 pr-3 rounded-full bg-[#f3f3fe] border border-[#c3c6d7]/80 focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/20" placeholder="Search patients, labs, reports..." />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">help</span>
            </button>
            <button type="button" className="ml-2 w-10 h-10 rounded-full overflow-hidden border-2 border-[#e7e7f3]">
              <img alt="Doctor avatar" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBF9BBTBsXIDKTgXMwGA1BkAmn04pCYhgsOiJDEngguRroSoqct4IOIAQDDbY7Dnd-Y4IivCbYF1fgbx34LnIXyc1gVg_9mcCESfPE4fmftbITogRkW2scodNuCzpokrIFX0ccfqdtjx3lWdppPDkFnRR31pZw1LUnLLIn_eU2G09BbIsC-eClq98ynxE9YJirdJVSERFBDZlE-I6Iwk-fipEjXe4gsdz4t6YolZ8JS7aHxYYeQi550" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] font-medium">Overview</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Healthcare Dashboard</h2>
            </div>
            <button type="button" className="inline-flex items-center gap-2 bg-[#004ac6] text-white px-5 py-3 rounded-xl shadow-sm hover:opacity-90">
              <span className="material-symbols-outlined text-[18px]">add</span>
              New report
            </button>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-4 shadow-sm">
                <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold ${metric.tone}`}>
                  <span className="material-symbols-outlined text-[14px]">trending_up</span>
                  {metric.label}
                </div>
                <div className="mt-5 text-3xl font-bold tracking-tight">{metric.value}</div>
                <div className="mt-1 text-sm text-[#434655]">{metric.detail}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold">Patient journey timeline</h3>
                <button type="button" className="text-sm text-[#004ac6] font-semibold">This week</button>
              </div>

              <div className="space-y-4">
                {[80, 65, 73, 90, 75].map((progress, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-[#434655]">{["Admissions", "Consultation", "Treatment", "Recovery", "Discharge"][index]}</span>
                      <span className="font-semibold text-[#191b23]">{progress}%</span>
                    </div>
                    <div className="h-2.5 bg-[#e7e7f3] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#004ac6] to-[#39b8fd]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#004ac6] to-[#39b8fd] text-white rounded-2xl p-5 shadow-sm">
              <p className="text-sm text-blue-100">AI assistant</p>
              <h3 className="mt-2 text-2xl font-bold">Care recommendations</h3>
              <ul className="mt-4 space-y-3 text-sm text-blue-50">
                <li className="flex gap-2"><span className="material-symbols-outlined text-[16px]">check_circle</span> Prioritize medication review for 3 high-risk patients.</li>
                <li className="flex gap-2"><span className="material-symbols-outlined text-[16px]">check_circle</span> Rebook post-op patients with mobility follow-ups.</li>
                <li className="flex gap-2"><span className="material-symbols-outlined text-[16px]">check_circle</span> Track blood pressure response in the next 48 hours.</li>
              </ul>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[0.8fr_1.2fr] gap-6">
            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">Queue today</h3>
                <button type="button" className="text-sm text-[#004ac6] font-semibold">View all</button>
              </div>

              <div className="space-y-3">
                {patientQueue.map((patient) => (
                  <div key={patient.name} className="flex items-center justify-between rounded-xl bg-[#f3f3fe] p-3">
                    <div>
                      <p className="font-semibold">{patient.name}</p>
                      <p className="text-sm text-[#434655]">{patient.time}</p>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${patient.tint}`}>{patient.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">Patient care board</h3>
                <button type="button" className="text-sm text-[#004ac6] font-semibold">Open board</button>
              </div>

              <div className="space-y-3">
                {careList.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-[#c3c6d7]/20 p-3">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-[#434655]">{item.detail}</p>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${item.badge}`}>{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
