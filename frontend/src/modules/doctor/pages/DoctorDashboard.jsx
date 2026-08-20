import React from "react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import {
  Users,
  BarChart3,
  Video,
  Star,
  RotateCw,
  Activity,
  UserPlus,
  FileCheck2,
  PenSquare,
  Trophy,
} from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";

/* -----------------------------------------------------------
   Sidebar nav — Appointments, Consultations, and Schedule
   removed per request. Swap doctorProfile for real data once
   wired to the backend.
------------------------------------------------------------ */


const statCards = [
  {
    icon: Activity,
    label: "Today's Appts",
    value: "12",
    badge: { text: "+2 walk-ins", tone: "bg-blue-50 text-blue-600 " },
  },
  {
    icon: Users,
    label: "Total Patients",
    value: "1,240",
  },
  {
    icon: BarChart3,
    label: "Pending Reports",
    value: "8",
    badge: { text: "Action Req.", tone: "bg-red-50 text-red-600 " },
  },
  {
    icon: Video,
    label: "Consultations Done",
    value: "45",
    accent: true,
  },
];

/* -----------------------------------------------------------
   Weekly activity summary — mock data for now.
   Swap for a real API call once you have an endpoint that
   aggregates a doctor's activity over the last 7 days
   (reports reviewed, patients added, prescriptions written).
------------------------------------------------------------ */
const weeklyActivity = {
  periodLabel: "This week",
  reportsReviewed: 14,
  newPatients: 3,
  prescriptionsAdded: 6,
  previousReportsReviewed: 9, // used to compute the trend line below
};

export default function DoctorDashboard() {
  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <PageHeader />

          <div className="grid grid-cols-1 gap-8">
            <section>
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Today's Overview
              </h3>
              <StatGrid />
            </section>

            <section>
              <WeeklyActivitySummary />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ---------------------------- Sidebar ---------------------------- */

function Sidebar() {
  return <DoctorSidebar />;
}

/* ----------------------------- Top bar ----------------------------- */

function TopBar() {
  return (
    <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white shadow-sm">
      <NotificationBell />
      <ProfileDropdown />
    </header>
  );
}

/* --------------------------- Page header --------------------------- */

function PageHeader() {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
          Good Morning, Dr. Jenkins
        </h2>
        <p className="text-slate-500 ">
          Here is your clinical overview for today, October 24.
        </p>
      </div>
    </div>
  );
}

/* --------------------------- Stat grid --------------------------- */

function StatGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {statCards.map((card) => (
        <StatCard key={card.label} card={card} />
      ))}

      {/* Patient satisfaction — wider card */}
      <div className="group col-span-2 sm:col-span-3 lg:col-span-2 bg-gradient-to-br from-white to-blue-50/60 border border-slate-200 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500 mb-1">Patient Satisfaction</p>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-slate-900 ">4.9</span>
              <span className="text-lg text-slate-400 ">/5</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Based on 128 reviews</p>
          </div>
          <button
            type="button"
            title="Refresh rating"
            className="p-1.5 rounded-lg text-slate-400 transition-colors duration-200 hover:bg-white hover:text-blue-600"
          >
            <RotateCw size={14} />
          </button>
        </div>
        <div className="flex text-blue-600 gap-0.5 mt-3">
          {[...Array(4)].map((_, i) => (
            <Star key={i} size={16} className="fill-current" />
          ))}
          <Star size={16} className="fill-current opacity-30" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ card }) {
  const Icon = card.icon;
  return (
    <div
      className={`group relative bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        card.accent ? "ring-1 ring-blue-100" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
          <Icon size={18} />
        </div>
        {card.badge && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${card.badge.tone}`}
          >
            {card.badge.text}
          </span>
        )}
      </div>
      <h3 className="text-3xl font-bold text-slate-900 leading-none">
        {card.value}
      </h3>
      <p className="text-sm text-slate-500 mt-1.5">{card.label}</p>
    </div>
  );
}

/* --------------------------- Weekly activity --------------------------- */

function WeeklyActivitySummary() {
  const trendPercent = weeklyActivity.previousReportsReviewed
    ? Math.round(
        ((weeklyActivity.reportsReviewed - weeklyActivity.previousReportsReviewed) /
          weeklyActivity.previousReportsReviewed) *
          100
      )
    : null;

  const metrics = [
    {
      icon: FileCheck2,
      value: weeklyActivity.reportsReviewed,
      label: "Reports reviewed",
    },
    {
      icon: UserPlus,
      value: weeklyActivity.newPatients,
      label: "New patients added",
    },
    {
      icon: PenSquare,
      value: weeklyActivity.prescriptionsAdded,
      label: "Prescriptions written",
    },
  ];

  return (
    <div className="relative bg-white border border-slate-200 rounded-2xl p-6 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-blue-50/60" />

      <div className="relative z-10 flex items-start justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Trophy size={18} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Your Week in Review
            </h3>
            <p className="text-sm text-slate-500">{weeklyActivity.periodLabel}</p>
          </div>
        </div>

        {trendPercent !== null && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              trendPercent >= 0
                ? "bg-emerald-50 text-emerald-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {trendPercent >= 0 ? "+" : ""}
            {trendPercent}% reports vs last week
          </span>
        )}
      </div>

      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {metrics.map(({ icon: Icon, value, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 transition-colors duration-200 hover:bg-blue-50/50"
          >
            <div className="w-9 h-9 rounded-lg bg-white text-blue-600 flex items-center justify-center shrink-0 shadow-sm">
              <Icon size={16} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 leading-none">
                {value}
              </p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}