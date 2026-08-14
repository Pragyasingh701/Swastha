import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Bell } from "lucide-react";
import DoctorSidebar from "../components/DoctorSidebar";
import ThemeToggle from "../../../components/Common/ThemeToggle";
import ProfileDropdown from "../../settings/components/ProfileDropdown";

const metrics = [
  { label: "Patient Visits", value: "12.4K", trend: "+8.2%", tone: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" },
  { label: "Avg. Cycle Time", value: "18 min", trend: "-6.1%", tone: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10" },
  { label: "Satisfaction", value: "96.5%", trend: "+2.7%", tone: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10" },
  { label: "No-show Rate", value: "4.2%", trend: "-1.4%", tone: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" },
];

const chartBars = [54, 68, 60, 76, 83, 72, 89, 94, 87, 92, 81, 97];

const tableData = [
  { name: "Cardiology", score: 94, volume: 456, trend: "+12.4%" },
  { name: "Diabetes Care", score: 91, volume: 387, trend: "+9.6%" },
  { name: "Orthopedics", score: 88, volume: 289, trend: "+6.8%" },
  { name: "Neurology", score: 83, volume: 220, trend: "+4.1%" },
];

export default function ClinicalAnalytics() {
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
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#004ac6] dark:text-blue-400">Performance analytics</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight dark:text-slate-100">Clinical Analytics</h2>
            </div>
            <button type="button" className="inline-flex items-center gap-2 bg-[#004ac6] dark:bg-blue-600 text-white px-5 py-3 rounded-xl shadow-sm hover:opacity-90">
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export report
            </button>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {metrics.map((item) => (
              <div key={item.label} className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <p className="text-sm text-[#434655] dark:text-slate-300">{item.label}</p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="text-3xl font-bold tracking-tight dark:text-slate-100">{item.value}</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.tone}`}>{item.trend}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold dark:text-slate-100">Monthly operational trend</h3>
                <button type="button" className="text-sm text-[#004ac6] dark:text-blue-400 font-semibold">This year</button>
              </div>

              <div className="h-64 flex items-end gap-3 px-2 pb-2">
                {chartBars.map((height, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-xl bg-gradient-to-t from-[#004ac6] via-[#2563eb] to-[#39b8fd] dark:from-blue-700 dark:via-blue-600 dark:to-blue-400"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs text-[#434655] dark:text-slate-400">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][index]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xl font-bold mb-4 dark:text-slate-100">Department health index</h3>
              <div className="space-y-4">
                {[82, 76, 68, 59].map((score, index) => (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#434655] dark:text-slate-300">{["ICU", "General Ward", "Emergency", "Outpatient"][index]}</span>
                      <span className="font-semibold text-[#191b23] dark:text-slate-100">{score}%</span>
                    </div>
                    <div className="h-2.5 bg-[#e7e7f3] dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#004ac6] to-[#39b8fd] dark:from-blue-600 dark:to-blue-400" style={{ width: `${score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 border border-[#c3c6d7]/20 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold dark:text-slate-100">Department performance</h3>
              <button type="button" className="text-sm text-[#004ac6] dark:text-blue-400 font-semibold">Download CSV</button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="text-sm text-[#434655] dark:text-slate-300 border-b border-[#c3c6d7]/30 dark:border-slate-800">
                    <th className="pb-3 font-medium">Specialty</th>
                    <th className="pb-3 font-medium">Quality score</th>
                    <th className="pb-3 font-medium">Volume</th>
                    <th className="pb-3 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row) => (
                    <tr key={row.name} className="border-b border-[#c3c6d7]/20 dark:border-slate-800 last:border-b-0">
                      <td className="py-4 font-semibold dark:text-slate-100">{row.name}</td>
                      <td className="py-4">
                        <span className="inline-flex items-center gap-2 dark:text-slate-100">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#004ac6] dark:bg-blue-500" />
                          {row.score}%
                        </span>
                      </td>
                      <td className="py-4 dark:text-slate-100">{row.volume}</td>
                      <td className="py-4 text-emerald-700 dark:text-emerald-400 font-semibold">{row.trend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
