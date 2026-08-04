import React, { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Settings,
  HelpCircle,
  PlusCircle,
  Search,
  SlidersHorizontal,
  ChevronDown,
  X,
  Bell,
  Paperclip,
  MessageSquare,
  Download,
  Sparkles,
  FlaskConical,
  ScanLine,
  Syringe,
} from "lucide-react";

/* -----------------------------------------------------------
   Static nav + timeline data.
   Swap `timelineEvents` for real data fetched by profileId.
------------------------------------------------------------ */

// Same nav list as Dashboard.jsx / LabTrends.jsx, with Health Timeline active
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, active: true, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
];

const FILTERS = ["All Members", "Lab Reports", "Prescriptions", "MRI/Scans"];

const timelineEvents = [
  {
    id: "evt-1",
    category: "Lab Reports",
    kind: "alert",
    icon: FlaskConical,
    tag: "ACTION REQUIRED",
    tagTone: "danger",
    title: "Blood Test (Apollo Hospitals)",
    meta: "Aug 14, 2024 · Diagnostic Panel #402",
    accent: true,
    stat: { label: "HbA1c: 6.8%", sub: "Above target range (4.0 - 5.6%)" },
    footer: [
      { icon: Paperclip, text: "2 PDF Files" },
      { icon: MessageSquare, text: "AI Summary Ready" },
    ],
  },
  {
    id: "evt-2",
    category: "Prescriptions",
    kind: "medication",
    icon: ClipboardList,
    tag: "ACTIVE MEDICATION",
    tagTone: "info",
    title: "Prescription (Dr. Mehta)",
    meta: "Jul 20, 2024 · Endocrine Specialist",
    rightTitle: "Metformin 500mg",
    rightSub: "Twice Daily (Post Meals)",
  },
  {
    id: "evt-3",
    category: "MRI/Scans",
    kind: "imaging",
    icon: ScanLine,
    tag: "IMAGING",
    tagTone: "neutral",
    title: "MRI Scan (Radiology Plus)",
    meta: "Jun 15, 2024 · Knee Assessment (Right)",
    image: true,
    chips: ["Bone Health", "Soft Tissue"],
    aiNote:
      "Your HbA1c is showing a rising trend over the last 3 months. Shall I prepare a summary for Dr. Mehta?",
  },
  {
    id: "evt-4",
    category: "Immunizations",
    kind: "immunization",
    icon: Syringe,
    tag: "IMMUNIZATION",
    tagTone: "danger",
    title: "Vaccination – Flu Shot",
    meta: "May 02, 2024 · Family Physician",
    rightBadge: "Valid",
  },
];

const tagStyles = {
  danger: "text-red-600",
  info: "text-blue-600",
  neutral: "text-slate-700",
};

const dotStyles = {
  alert: "bg-red-50 text-red-500 ring-red-100",
  medication: "bg-blue-50 text-blue-500 ring-blue-100",
  imaging: "bg-slate-100 text-slate-600 ring-slate-200",
  immunization: "bg-red-50 text-red-500 ring-red-100",
};

export default function Timeline() {
  const { profileId } = useParams();
  const [activeFilter, setActiveFilter] = useState("All Members");

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />

      <main className="flex-1 px-10 py-8">
        <header className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Health Timeline
            </h1>
            <p className="text-slate-500 mt-1">
              Comprehensive history of your medical journey
              {profileId ? (
                <span className="text-slate-400"> · profile {profileId}</span>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-300 to-orange-300 ring-2 ring-white transition-transform duration-200 hover:scale-110 hover:z-10" />
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-medium flex items-center justify-center ring-2 ring-white transition-transform duration-200 hover:scale-110">
                +2
              </div>
            </div>
            <button className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 transition-all duration-200 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm">
              <Bell size={18} />
            </button>
          </div>
        </header>

        <FilterBar activeFilter={activeFilter} setActiveFilter={setActiveFilter} />

        <TimelineList activeFilter={activeFilter} />
      </main>
    </div>
  );
}

/* ---------------------------- Sidebar ---------------------------- */
/* Copied from Dashboard.jsx / LabTrends.jsx so all pages share identical behavior. */

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 border-r border-slate-200 min-h-screen px-4 py-6">
      <div className="px-2 mb-8">
        <h1 className="text-xl font-bold text-blue-700 leading-tight">
          Swastha AI
        </h1>
        <p className="text-[10px] tracking-widest text-slate-400 font-medium mt-0.5">
          CLINICAL INTELLIGENCE
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon: Icon, active, route }) => {
          const isActive = Boolean(route && (pathname === route || pathname.startsWith(`${route}/`))) || active;

          return (
            <button
              key={label}
              type="button"
              onClick={() => route && navigate(route)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-100 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
            <Icon size={18} />
            {label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 pt-4">
        <button
          type="button"
          onClick={() => navigate("/family-vault")}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 transition-colors text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          <PlusCircle size={18} />
          Open Family Vault
        </button>

        <div className="space-y-1 pt-2">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
            <Settings size={18} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">
            <HelpCircle size={18} />
            Support
          </button>
        </div>
      </div>
    </aside>
  );
}

/* --------------------------- Filter bar --------------------------- */

function FilterBar({ activeFilter, setActiveFilter }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-8 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-xl transition-all duration-200 hover:bg-slate-100">
          <span>Aug 2023 - Aug 2024</span>
          <ChevronDown size={14} />
        </button>

        <div className="w-px h-5 bg-slate-200" />

        {FILTERS.map((filter) => {
          const isActive = filter === activeFilter;
          return (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all duration-200
                ${
                  isActive
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
            >
              {filter}
              {isActive && (
                <X
                  size={13}
                  className="opacity-60 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFilter("All Members");
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600">
          <Search size={17} />
        </button>
        <button className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600">
          <SlidersHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}

/* -------------------------- Timeline list -------------------------- */

function TimelineList({ activeFilter }) {
  const events =
    !activeFilter || activeFilter === "All Members"
      ? timelineEvents
      : timelineEvents.filter((event) => event.category === activeFilter);

  return (
    <div className="relative pl-4">
      <div className="absolute left-[27px] top-2 bottom-2 border-l-2 border-dashed border-slate-200" />

      {events.length === 0 ? (
        <p className="text-slate-400 text-sm py-10 text-center">
          No entries match this filter yet.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {events.map((event) => (
            <TimelineRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineRow({ event }) {
  const Icon = event.icon;

  return (
    <div className="relative flex gap-5">
      {/* dot */}
      <div
        className={`relative z-10 w-11 h-11 shrink-0 rounded-full flex items-center justify-center ring-8 ring-slate-50 ${dotStyles[event.kind]}
          transition-transform duration-300 hover:scale-110 ${
            event.kind === "alert" ? "animate-[pulse_2.5s_ease-in-out_infinite]" : ""
          }`}
      >
        <Icon size={18} />
      </div>

      <EventCard event={event} />
    </div>
  );
}

function EventCard({ event }) {
  const isAccent = event.accent;

  return (
    <div
      className={`group relative flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6
        transition-all duration-300 ease-out
        hover:shadow-lg hover:-translate-y-1
        ${isAccent ? "border-l-4 border-l-red-500" : "hover:border-blue-100"}`}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p
            className={`text-xs font-semibold tracking-wide mb-1.5 ${tagStyles[event.tagTone]}`}
          >
            {event.tag}
          </p>
          <h3 className="font-semibold text-slate-900 transition-colors duration-200 group-hover:text-blue-700">
            {event.title}
          </h3>
          <p className="text-sm text-slate-400 mt-1">{event.meta}</p>

          {event.chips && (
            <div className="flex gap-2 mt-3">
              {event.chips.map((chip) => (
                <span
                  key={chip}
                  className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-600"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* right-side content varies by event kind */}
        {event.stat && (
          <div className="shrink-0 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-right transition-transform duration-200 group-hover:scale-105">
            <p className="text-red-600 font-semibold text-sm">
              {event.stat.label}
            </p>
            <p className="text-red-400 text-xs mt-0.5">{event.stat.sub}</p>
          </div>
        )}

        {event.rightTitle && (
          <div className="shrink-0 text-right">
            <p className="text-blue-600 font-medium">{event.rightTitle}</p>
            <p className="text-slate-400 text-sm mt-0.5">{event.rightSub}</p>
          </div>
        )}

        {event.rightBadge && (
          <span className="shrink-0 text-emerald-600 text-sm font-medium">
            {event.rightBadge}
          </span>
        )}

        {event.image && (
          <button className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-slate-50 hover:text-blue-600 hover:scale-110">
            <Download size={17} />
          </button>
        )}
      </div>

      {event.image && (
        <div className="mt-4 relative">
          <div className="w-full h-40 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 overflow-hidden flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.01]">
            <ScanLine size={40} className="text-slate-400" />
          </div>

          {event.aiNote && (
            <div className="absolute -bottom-6 right-4 max-w-xs bg-white border border-blue-100 rounded-2xl shadow-md p-4 transition-all duration-300 group-hover:shadow-lg group-hover:-translate-y-1">
              <p className="flex items-center gap-1.5 text-blue-600 text-xs font-semibold mb-1.5">
                <Sparkles size={13} />
                Swastha Intelligence
              </p>
              <p className="text-sm text-slate-600 leading-snug">
                {event.aiNote}
              </p>
            </div>
          )}
        </div>
      )}

      {event.footer && (
        <div className="flex items-center gap-5 mt-4 pt-4 border-t border-slate-50">
          {event.footer.map(({ icon: Icon, text }) => (
            <span
              key={text}
              className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors duration-200 hover:text-blue-600"
            >
              <Icon size={14} />
              {text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}