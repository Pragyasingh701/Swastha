import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import DoctorSidebar from "../components/DoctorSidebar";
import ThemeToggle from "../../../components/Common/ThemeToggle";
import ProfileDropdown from "../../settings/components/ProfileDropdown";

const statCards = [
  { label: "Risk Score", value: "18%", change: "-6% vs last week", tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" },
  { label: "Readmission Risk", value: "Low", change: "2.1% probability", tone: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10" },
  { label: "Medication Adherence", value: "92%", change: "+7% improved", tone: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" },
  { label: "Care Gaps", value: "03", change: "Needs review", tone: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" },
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

        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#004ac6] dark:text-blue-400">Clinical intelligence</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight dark:text-slate-100">Patient Profile & AI Assistant</h2>
            </div>
            <button type="button" className="inline-flex items-center gap-2 bg-[#004ac6] dark:bg-blue-600 text-white px-5 py-3 rounded-xl shadow-sm hover:opacity-90">
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
              Generate summary
            </button>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold ${card.tone}`}>
                  <span className="material-symbols-outlined text-[14px]">trending_up</span>
                  {card.label}
                </div>
                <div className="mt-5 text-3xl font-bold tracking-tight dark:text-slate-100">{card.value}</div>
                <div className="mt-1 text-sm text-[#434655] dark:text-slate-300">{card.change}</div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
            <div className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-[#434655] dark:text-slate-300">Patient overview</p>
                  <h3 className="text-2xl font-bold dark:text-slate-100">Robert Chen</h3>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 text-xs font-semibold">Stable</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#f3f3fe] dark:bg-slate-800 rounded-xl p-4">
                  <p className="text-sm text-[#434655] dark:text-slate-300">Baseline vitals</p>
                  <div className="mt-3 text-3xl font-bold dark:text-slate-100">120/80</div>
                  <div className="text-sm text-[#434655] dark:text-slate-300">BP avg</div>
                </div>
                <div className="bg-[#f3f3fe] dark:bg-slate-800 rounded-xl p-4">
                  <p className="text-sm text-[#434655] dark:text-slate-300">Glucose</p>
                  <div className="mt-3 text-3xl font-bold dark:text-slate-100">98</div>
                  <div className="text-sm text-[#434655] dark:text-slate-300">mg/dL</div>
                </div>
                <div className="bg-[#f3f3fe] dark:bg-slate-800 rounded-xl p-4">
                  <p className="text-sm text-[#434655] dark:text-slate-300">Recovery</p>
                  <div className="mt-3 text-3xl font-bold dark:text-slate-100">91%</div>
                  <div className="text-sm text-[#434655] dark:text-slate-300">progress</div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#004ac6] to-[#39b8fd] dark:from-blue-700 dark:to-blue-500 text-white rounded-2xl p-5 shadow-sm">
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
            <div className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold dark:text-slate-100">Recent AI alerts</h3>
                <button type="button" className="text-sm text-[#004ac6] dark:text-blue-400 font-semibold">View all</button>
              </div>
              <div className="space-y-3">
                {timeline.map((item) => (
                  <div key={item.title} className="flex gap-3 rounded-xl bg-[#f3f3fe] dark:bg-slate-800 p-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#004ac6] dark:bg-blue-500 mt-2" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold dark:text-slate-100">{item.title}</p>
                        <span className="text-xs text-[#434655] dark:text-slate-400">{item.time}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#434655] dark:text-slate-300">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold dark:text-slate-100">Health trend overview</h3>
                <span className="text-sm text-[#434655] dark:text-slate-300">Last 30 days</span>
              </div>

              <div className="h-56 flex items-end gap-4 px-2 pt-4">
                {[42, 65, 58, 70, 80, 75, 92].map((value, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-3">
                    <div className="w-full rounded-t-xl bg-gradient-to-t from-[#004ac6] via-[#2563eb] to-[#39b8fd] dark:from-blue-700 dark:via-blue-600 dark:to-blue-400" style={{ height: `${value}%` }} />
                    <span className="text-xs text-[#434655] dark:text-slate-400">{["M","T","W","T","F","S","S"][index]}</span>
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
