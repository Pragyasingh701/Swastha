import React from "react";
import logo from "../../../assets/swastha-logo.png";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import {
  ShieldPlus,
  LayoutGrid,
  Users,
  ClipboardList,
  FileText,
  BarChart3,
  Mail,
  TrendingUp,
  Bell,
  Settings,
  Search,
  HelpCircle,
  Plus,
  Video,
  Star,
  RotateCw,
  Pill,
  FolderOpen,
  Siren,
  Sparkles,
  ArrowRight,
  Stethoscope,
  Activity,
} from "lucide-react";

/* -----------------------------------------------------------
   Sidebar nav — Appointments, Consultations, and Schedule
   removed per request. Swap doctorProfile / scheduleItems for
   real data once wired to the backend.
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

const scheduleItems = [
  {
    time: "10:30",
    name: "Robert Chen",
    detail: "Video Follow-up",
    detailIcon: Video,
    avatar: "https://i.pravatar.cc/80?img=13",
    status: { text: "Waiting (5m)", tone: "bg-blue-50 text-blue-600 " },
    action: { label: "Join Now", style: "primary" },
    dotTone: "bg-blue-600 ring-blue-100 ",
    state: "upcoming",
  },
  {
    time: "11:15",
    name: "Emily Stanton",
    detail: "Routine Checkup",
    detailIcon: Stethoscope,
    avatar: "https://i.pravatar.cc/80?img=32",
    status: { text: "Checked-in", tone: "bg-slate-100 text-slate-600 " },
    action: { label: "View Chart", style: "secondary" },
    dotTone: "bg-slate-300 ring-slate-100 ",
    state: "upcoming",
  },
  {
    time: "09:00",
    name: "Michael Jordan",
    detail: "ECG Review",
    detailIcon: Activity,
    initials: "MJ",
    status: { text: "Completed", tone: "" },
    dotTone: "bg-slate-300 ",
    state: "done",
  },
];

const quickActions = [
  { icon: Video, label: "Start Consult" },
  { icon: Pill, label: "Add Script" },
  { icon: FolderOpen, label: "View Reports" },
  { icon: Siren, label: "Emergency Cases", danger: true },
];

export default function DoctorDashboard() {
  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <PageHeader />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 flex flex-col gap-6">
              <StatGrid />
              <TodaySchedule />
            </div>

            <div className="lg:col-span-4 flex flex-col gap-6">
              <QuickActions />
              <ClinicalInsight />
            </div>
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
    <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
      <button className="relative p-2 rounded-lg hover:bg-slate-100 shrink-0">
        <Bell size={20} className="text-slate-600 " />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
      </button>

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
      <button className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5">
        <Plus size={18} />
        New Consultation
      </button>
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
      <div className="group col-span-2 sm:col-span-3 lg:col-span-2 bg-gradient-to-br from-white to-blue-50/60 border border-slate-200 rounded-2xl p-5 flex items-start justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ">
        <div>
          <p className="text-sm text-slate-500 mb-1">Patient Satisfaction</p>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold text-slate-900 ">4.9</span>
            <span className="text-lg text-slate-400 ">/5</span>
          </div>
        </div>
        <div className="flex text-blue-600 gap-0.5 mt-1">
          {[...Array(4)].map((_, i) => (
            <Star key={i} size={16} className="fill-current" />
          ))}
          <RotateCw size={16} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ card }) {
  const Icon = card.icon;
  return (
    <div
      className={`group relative bg-white border border-slate-200 rounded-2xl p-5 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        card.accent ? "border-t-2 border-t-blue-500" : ""
      }`}
    >
      <Icon
        size={56}
        className="absolute -top-1 -right-1 text-blue-600 opacity-[0.06] transition-transform duration-300 group-hover:scale-110"
      />
      <p className="text-sm text-slate-500 mb-2 relative z-10">{card.label}</p>
      <div className="flex items-end gap-2 relative z-10">
        <h3 className="text-3xl font-bold text-slate-900 leading-none">
          {card.value}
        </h3>
        {card.badge && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full mb-0.5 ${card.badge.tone}`}
          >
            {card.badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------- Today's schedule ------------------------- */

function TodaySchedule() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-shadow duration-300 hover:shadow-lg ">
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 ">
        <h3 className="text-lg font-semibold text-slate-900 ">
          Today's Schedule
        </h3>
        <button className="text-sm font-medium text-blue-600 transition-colors duration-200 hover:text-blue-700 hover:underline">
          View Full Calendar
        </button>
      </div>

      <div className="relative pl-2">
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-200 " />

        <div className="flex flex-col gap-5">
          {scheduleItems.map((item) => (
            <ScheduleRow key={item.name} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduleRow({ item }) {
  const DetailIcon = item.detailIcon;
  const isPast = item.state === "done";

  return (
    <div className={`group flex gap-4 relative ${isPast ? "opacity-60" : ""}`}>
      <div className="relative z-10 flex flex-col items-center w-10 pt-1 shrink-0">
        <div
          className={`w-3 h-3 rounded-full ring-4 ${item.dotTone}`}
        />
        <span className="text-xs text-slate-400 mt-1">{item.time}</span>
      </div>

      <div
        className={`flex-1 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-200 ${
          isPast
            ? "bg-slate-50 "
            : "bg-white border border-slate-100 shadow-sm group-hover:border-blue-200 group-hover:shadow-md"
        }`}
      >
        <div className="flex items-center gap-3">
          {item.avatar ? (
            <img
              src={item.avatar}
              alt={item.name}
              className="w-11 h-11 rounded-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-slate-200 text-slate-500 font-semibold flex items-center justify-center">
              {item.initials}
            </div>
          )}
          <div>
            <h4
              className={`text-sm font-semibold text-slate-900 ${
                isPast ? "line-through" : ""
              }`}
            >
              {item.name}
            </h4>
            <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
              <DetailIcon size={13} />
              {item.detail}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span
            className={`text-xs font-medium px-3 py-1 rounded-full ${item.status.tone}`}
          >
            {item.status.text}
          </span>
          {item.action?.style === "primary" && (
            <button className="bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all duration-200 hover:bg-blue-700 hover:shadow-md">
              {item.action.label}
            </button>
          )}
          {item.action?.style === "secondary" && (
            <button className="border border-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded-lg bg-white transition-colors duration-200 hover:bg-slate-50 ">
              {item.action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Quick actions --------------------------- */

function QuickActions() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 transition-shadow duration-300 hover:shadow-lg ">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Quick Actions
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map(({ icon: Icon, label, danger }) => (
          <button
            key={label}
            className={`group flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 ${
              danger
                ? "bg-red-50 border-red-100 hover:bg-red-100 "
                : "bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 "
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${
                danger
                  ? "bg-red-600 text-white animate-pulse"
                  : "bg-blue-50 text-blue-600 "
              }`}
            >
              <Icon size={18} />
            </div>
            <span
              className={`text-xs font-medium text-center ${
                danger ? "text-red-600 font-semibold" : "text-slate-700 "
              }`}
            >
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------- Clinical insight ------------------------- */

function ClinicalInsight() {
  return (
    <div className="relative bg-white border border-slate-200 rounded-2xl p-6 overflow-hidden transition-shadow duration-300 hover:shadow-lg ">
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-600 to-sky-400" />

      <div className="flex items-start gap-3 relative z-10">
        <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Sparkles size={18} />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-1.5">
            Clinical Intelligence Insight
          </h4>
          <p className="text-sm text-slate-500 leading-relaxed">
            Based on recent labs, patient{" "}
            <span className="font-semibold text-blue-600 ">Robert Chen</span>{" "}
            shows a 15% increase in LDL levels. Consider reviewing statin
            dosage during today's follow-up.
          </p>
          <button className="mt-3 flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-all duration-200 hover:gap-2.5 hover:text-blue-700 ">
            Review Lab Trends
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}