import React from "react";
import DoctorSidebar from "../components/DoctorSidebar";

const metrics = [
  { label: "Patient Visits", value: "12.4K", trend: "+8.2%", tone: "text-emerald-600 bg-emerald-50" },
  { label: "Avg. Cycle Time", value: "18 min", trend: "-6.1%", tone: "text-blue-600 bg-blue-50" },
  { label: "Satisfaction", value: "96.5%", trend: "+2.7%", tone: "text-violet-600 bg-violet-50" },
  { label: "No-show Rate", value: "4.2%", trend: "-1.4%", tone: "text-amber-600 bg-amber-50" },
];

const chartBars = [54, 68, 60, 76, 83, 72, 89, 94, 87, 92, 81, 97];

const tableData = [
  { name: "Cardiology", score: 94, volume: 456, trend: "+12.4%" },
  { name: "Diabetes Care", score: 91, volume: 387, trend: "+9.6%" },
  { name: "Orthopedics", score: 88, volume: 289, trend: "+6.8%" },
  { name: "Neurology", score: 83, volume: 220, trend: "+4.1%" },
];

export default function ClinicalAnalytics() {
  return (
    <div className="min-h-screen bg-[#faf8ff] text-[#191b23] antialiased flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-[#faf8ff]/80 backdrop-blur-md border-b border-[#c3c6d7]/40 sticky top-0 z-40 h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span className="text-xl font-bold text-[#004ac6]">Swastha</span>
          </div>

          <div className="hidden lg:flex flex-1 max-w-xl relative ml-6">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]">search</span>
            <input
              type="text"
              className="w-full h-11 pl-11 pr-3 rounded-full bg-[#f3f3fe] border border-[#c3c6d7]/80 focus:border-[#004ac6] focus:ring-2 focus:ring-[#004ac6]/20"
              placeholder="Search analytics, departments, KPI..."
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button type="button" className="p-2 rounded-full hover:bg-slate-100 text-[#434655]">
              <span className="material-symbols-outlined">help</span>
            </button>
            <button type="button" className="ml-2 w-10 h-10 rounded-full overflow-hidden border-2 border-[#e7e7f3]">
              <img
                alt="Doctor avatar"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBF9BBTBsXIDKTgXMwGA1BkAmn04pCYhgsOiJDEngguRroSoqct4IOIAQDDbY7Dnd-Y4IivCbYF1fgbx34LnIXyc1gVg_9mcCESfPE4fmftbITogRkW2scodNuCzpokrIFX0ccfqdtjx3lWdppPDkFnRR31pZw1LUnLLIn_eU2G09BbIsC-eClq98ynxE9YJirdJVSERFBDZlE-I6Iwk-fipEjXe4gsdz4t6YolZ8JS7aHxYYeQi550"
              />
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#004ac6]">Performance analytics</p>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Clinical Analytics</h2>
            </div>
            <button type="button" className="inline-flex items-center gap-2 bg-[#004ac6] text-white px-5 py-3 rounded-xl shadow-sm hover:opacity-90">
              <span className="material-symbols-outlined text-[18px]">download</span>
              Export report
            </button>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {metrics.map((item) => (
              <div key={item.label} className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-4 shadow-sm">
                <p className="text-sm text-[#434655]">{item.label}</p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div className="text-3xl font-bold tracking-tight">{item.value}</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.tone}`}>{item.trend}</span>
                </div>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-bold">Monthly operational trend</h3>
                <button type="button" className="text-sm text-[#004ac6] font-semibold">This year</button>
              </div>

              <div className="h-64 flex items-end gap-3 px-2 pb-2">
                {chartBars.map((height, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-xl bg-gradient-to-t from-[#004ac6] via-[#2563eb] to-[#39b8fd]"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-xs text-[#434655]">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][index]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xl font-bold mb-4">Department health index</h3>
              <div className="space-y-4">
                {[82, 76, 68, 59].map((score, index) => (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#434655]">{["ICU", "General Ward", "Emergency", "Outpatient"][index]}</span>
                      <span className="font-semibold text-[#191b23]">{score}%</span>
                    </div>
                    <div className="h-2.5 bg-[#e7e7f3] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#004ac6] to-[#39b8fd]" style={{ width: `${score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#c3c6d7]/20 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Department performance</h3>
              <button type="button" className="text-sm text-[#004ac6] font-semibold">Download CSV</button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="text-sm text-[#434655] border-b border-[#c3c6d7]/30">
                    <th className="pb-3 font-medium">Specialty</th>
                    <th className="pb-3 font-medium">Quality score</th>
                    <th className="pb-3 font-medium">Volume</th>
                    <th className="pb-3 font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row) => (
                    <tr key={row.name} className="border-b border-[#c3c6d7]/20 last:border-b-0">
                      <td className="py-4 font-semibold">{row.name}</td>
                      <td className="py-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#004ac6]" />
                          {row.score}%
                        </span>
                      </td>
                      <td className="py-4">{row.volume}</td>
                      <td className="py-4 text-emerald-700 font-semibold">{row.trend}</td>
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
