import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";

const metrics = [
  { label: "Visits today", value: "146", detail: "+12% vs yesterday", tone: "bg-blue-50 text-blue-700 " },
  { label: "Critical alerts", value: "07", detail: "3 new this morning", tone: "bg-orange-50 text-orange-700 " },
  { label: "Discharge rate", value: "84%", detail: "+4.3% effiency", tone: "bg-emerald-50 text-emerald-700 " },
  { label: "Bed occupancy", value: "68%", detail: "Normal operating", tone: "bg-violet-50 text-violet-700 " },
];

const patientQueue = [
  { name: "Aisha Patel", time: "09:30 AM", status: "Consultation", tint: "bg-blue-100 text-blue-700 " },
  { name: "Milo Grant", time: "10:15 AM", status: "Lab Review", tint: "bg-violet-100 text-violet-700 " },
  { name: "Ibrahim Ali", time: "11:00 AM", status: "Follow-up", tint: "bg-emerald-100 text-emerald-700 " },
];

const careList = [
  { name: "Robert Chen", status: "Improving", detail: "BP trending down", badge: "bg-emerald-100 text-emerald-700 " },
  { name: "Sarah Jenkins", status: "Review", detail: "HbA1c check due", badge: "bg-amber-100 text-amber-700 " },
  { name: "Marcus Thorne", status: "Stable", detail: "Mobility improved", badge: "bg-blue-100 text-blue-700 " },
];

export default function ModernHealthDashboard() {
  const navigate = useNavigate();

  return (
    <div className="h-screen overflow-hidden bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600 "
          >
            <Sparkles size={16} />
            Ask Swastha about your health records...
          </button>

          <button className="relative p-2 rounded-lg hover:bg-slate-100 shrink-0">
            <Bell size={20} className="text-slate-600 " />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>


          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-[#004ac6] font-medium">Overview</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight ">Healthcare Dashboard</h2>
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
                <div className="mt-5 text-3xl font-bold tracking-tight ">{metric.value}</div>
                <div className="mt-1 text-sm text-[#434655] ">{metric.detail}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold ">Patient journey timeline</h3>
                <button type="button" className="text-sm text-[#004ac6] font-semibold">This week</button>
              </div>

              <div className="space-y-4">
                {[80, 65, 73, 90, 75].map((progress, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-[#434655] ">{["Admissions", "Consultation", "Treatment", "Recovery", "Discharge"][index]}</span>
                      <span className="font-semibold text-[#191b23] ">{progress}%</span>
                    </div>
                    <div className="h-2.5 bg-[#e7e7f3] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#004ac6] to-[#39b8fd] " style={{ width: `${progress}%` }} />
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
                <h3 className="text-xl font-bold ">Queue today</h3>
                <button type="button" className="text-sm text-[#004ac6] font-semibold">View all</button>
              </div>

              <div className="space-y-3">
                {patientQueue.map((patient) => (
                  <div key={patient.name} className="flex items-center justify-between rounded-xl bg-[#f3f3fe] p-3">
                    <div>
                      <p className="font-semibold ">{patient.name}</p>
                      <p className="text-sm text-[#434655] ">{patient.time}</p>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${patient.tint}`}>{patient.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold ">Patient care board</h3>
                <button type="button" className="text-sm text-[#004ac6] font-semibold">Open board</button>
              </div>

              <div className="space-y-3">
                {careList.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-[#c3c6d7]/20 p-3">
                    <div>
                      <p className="font-semibold ">{item.name}</p>
                      <p className="text-sm text-[#434655] ">{item.detail}</p>
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
