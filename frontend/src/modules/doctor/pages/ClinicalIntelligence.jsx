import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";

const statCards = [
  { label: "Risk Score", value: "18%", change: "-6% vs last week", tone: "text-emerald-600 bg-emerald-50 " },
  { label: "Readmission Risk", value: "Low", change: "2.1% probability", tone: "text-blue-600 bg-blue-50 " },
  { label: "Medication Adherence", value: "92%", change: "+7% improved", tone: "text-violet-600 bg-violet-50 " },
  { label: "Care Gaps", value: "03", change: "Needs review", tone: "text-amber-600 bg-amber-50 " },
];

const timeline = [
  { title: "Medication review recommended", time: "08:45 AM", detail: "Insulin schedule adjusted for better compliance." },
  { title: "Lab follow-up due", time: "Yesterday", detail: "HbA1c follow-up due by Thursday." },
  { title: "AI alert: blood pressure trend", time: "Mon", detail: "Systolic readings trending upward over 3 days." },
];

const insights = [
  "Improvement in walking tolerance after physiotherapy.",
  "Blood pressure variability reduced by 8% in last 7 days.",
  "Nutrition follow-up can further reduce fatigue symptoms.",
];

export default function ClinicalIntelligence() {
  const navigate = useNavigate();

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
            <button type="button" className="inline-flex items-center gap-2 bg-[#004ac6] text-white px-5 py-3 rounded-xl shadow-sm hover:opacity-90">
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
              Generate summary
            </button>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-4 shadow-sm">
                <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold ${card.tone}`}>
                  <span className="material-symbols-outlined text-[14px]">trending_up</span>
                  {card.label}
                </div>
                <div className="mt-5 text-3xl font-bold tracking-tight ">{card.value}</div>
                <div className="mt-1 text-sm text-[#434655] ">{card.change}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-[#434655] ">Patient overview</p>
                  <h3 className="text-2xl font-bold ">Robert Chen</h3>
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
            </div>

            <div className="bg-gradient-to-br from-[#004ac6] to-[#39b8fd] text-white rounded-2xl p-5 shadow-sm">
              <p className="text-sm text-blue-100">AI insight</p>
              <h3 className="mt-2 text-2xl font-bold">Clinical Summary</h3>
              <ul className="mt-5 space-y-3 text-sm text-blue-50">
                {insights.map((item) => (
                  <li key={item} className="flex gap-2 items-start">
                    <span className="material-symbols-outlined text-[16px] mt-0.5">check_circle</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
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
        </main>
      </div>
    </div>
  );
}
