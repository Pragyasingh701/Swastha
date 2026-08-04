import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Search,
  Bell,
  Settings,
  HelpCircle,
  PlusCircle,
  ShieldCheck,
  Droplet,
  HeartPulse,
  Sun,
  ArrowDown,
  ArrowUp,
  Minus,
  FlaskConical,
  Syringe,
  Lock,
  QrCode,
  Fingerprint,
  AtSign,
} from "lucide-react";

// Same nav list as Dashboard.jsx, with Lab Insights marked active
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, active: true, route: "/lab-trends" },
];

/* -----------------------------------------------------------
   Sample data — swap for real values fetched by patientId.
------------------------------------------------------------ */

const RANGES = {
  "6 Months": [
    { label: "Feb", value: 88 },
    { label: "Mar", value: 92 },
    { label: "Apr", value: 108 },
    { label: "May", value: 101 },
    { label: "Jun", value: 112 },
    { label: "Jul", value: 118 },
    { label: "Aug", value: 115 },
  ],
  "1 Year": [
    { label: "Sep", value: 82 },
    { label: "Nov", value: 86 },
    { label: "Jan", value: 90 },
    { label: "Mar", value: 100 },
    { label: "May", value: 108 },
    { label: "Jul", value: 118 },
    { label: "Aug", value: 115 },
  ],
  "All Time": [
    { label: "2021", value: 78 },
    { label: "2022", value: 84 },
    { label: "2023", value: 91 },
    { label: "2024", value: 105 },
    { label: "2025", value: 112 },
    { label: "2026", value: 115 },
  ],
};

const statCards = [
  {
    icon: Droplet,
    tone: "healthy",
    label: "HbA1c",
    value: "5.4%",
    status: "Healthy",
    delta: { dir: "down", text: "0.2%" },
    progress: 68,
  },
  {
    icon: HeartPulse,
    tone: "action",
    label: "Cholesterol (LDL)",
    value: "115",
    status: "Action Required",
    delta: { dir: "up", text: "12 mg/dL" },
    progress: 78,
  },
  {
    icon: Sun,
    tone: "optimal",
    label: "Vitamin D",
    value: "32",
    status: "Optimal",
    delta: { dir: "flat", text: "Stable" },
    progress: 90,
  },
];

const followUps = [
  { icon: FlaskConical, title: "Lipid Profile", due: "Due in 12 days" },
  { icon: Syringe, title: "Vitamin B12 Scan", due: "Due in 45 days" },
];

const toneStyles = {
  healthy: {
    iconBg: "bg-emerald-50 text-emerald-500",
    barBg: "bg-emerald-500",
    statusText: "text-emerald-500",
    deltaBg: "bg-emerald-50 text-emerald-600",
  },
  action: {
    iconBg: "bg-orange-50 text-orange-500",
    barBg: "bg-orange-400",
    statusText: "text-orange-500",
    deltaBg: "bg-orange-50 text-orange-600",
  },
  optimal: {
    iconBg: "bg-blue-50 text-blue-500",
    barBg: "bg-emerald-500",
    statusText: "text-slate-400",
    deltaBg: "bg-slate-100 text-slate-500",
  },
};

export default function LabInsights() {
  const [range, setRange] = useState("6 Months");
  const data = useMemo(() => RANGES[range], [range]);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex-1 px-10 py-8">
        <PageHeader />
        <StatRow />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-6">
          <GlucoseTrendCard range={range} setRange={setRange} data={data} />
          <div className="flex flex-col gap-6">
            <AiInsightCard />
            <FollowUpCard />
          </div>
        </div>

        <PhysicianSummary />
        <Footer />
      </div>
    </div>
  );
}

/* ------------------------------ Sidebar ------------------------------ */
/* Copied from Dashboard.jsx so both pages share identical behavior. */

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

/* ------------------------------ Header ------------------------------ */

function PageHeader() {
  return (
    <header className="flex items-start justify-between mb-8">
      <h1 className="text-3xl font-semibold text-slate-900 leading-snug">
        Lab
        <br />
        Insights
      </h1>

      <div className="flex items-center gap-4">
        <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-white hover:text-blue-600 hover:shadow-sm">
          <Search size={18} />
        </button>
        <button className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 transition-all duration-200 hover:bg-white hover:text-blue-600 hover:shadow-sm">
          <Bell size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-semibold text-slate-900">
              Dr. Sarah Chen
            </p>
            <p className="text-xs text-slate-400">Patient: Rahul Verma</p>
          </div>
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pink-300 to-orange-300 transition-transform duration-200 hover:scale-110" />
        </div>
      </div>
    </header>
  );
}

/* ---------------------------- Stat cards ---------------------------- */

function StatRow() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      {statCards.map((card) => (
        <StatCard key={card.label} card={card} />
      ))}
    </div>
  );
}

function StatCard({ card }) {
  const tone = toneStyles[card.tone];
  const Icon = card.icon;
  const DeltaIcon =
    card.delta.dir === "up" ? ArrowUp : card.delta.dir === "down" ? ArrowDown : Minus;

  return (
    <div className="group bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone.iconBg} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}
        >
          <Icon size={18} />
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${tone.deltaBg}`}
        >
          <DeltaIcon size={11} />
          {card.delta.text}
        </span>
      </div>

      <p className="text-sm text-slate-400 mb-1">{card.label}</p>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-semibold text-slate-900">
          {card.value}
        </span>
        <span className={`text-sm font-medium ${tone.statusText}`}>
          {card.status}
        </span>
      </div>

      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${tone.barBg} transition-all duration-700 ease-out group-hover:brightness-110`}
          style={{ width: `${card.progress}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------- Glucose trend card ------------------------- */

function GlucoseTrendCard({ range, setRange, data }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 transition-shadow duration-300 hover:shadow-lg">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Glucose Metabolism Trends
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Detailed analysis of Blood Glucose (Fasting) over the last{" "}
            {range.toLowerCase()}.
          </p>
        </div>

        <div className="flex bg-slate-50 rounded-xl p-1">
          {Object.keys(RANGES).map((option) => (
            <button
              key={option}
              onClick={() => setRange(option)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                range === option
                  ? "bg-white text-blue-600 font-medium shadow-sm"
                  : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="h-80 mt-4 -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="glucoseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke="#EEF1F6" />

            <ReferenceArea
              y1={70}
              y2={100}
              fill="#22C55E"
              fillOpacity={0.06}
              stroke="#22C55E"
              strokeOpacity={0.25}
              strokeDasharray="4 4"
              label={{
                value: "NORMAL RANGE (70-100 MG/DL)",
                position: "insideTopLeft",
                fill: "#94A3B8",
                fontSize: 11,
                fontWeight: 600,
              }}
            />

            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94A3B8", fontSize: 12 }}
            />
            <YAxis hide domain={[60, 130]} />

            <Tooltip
              cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
              content={<GlucoseTooltip />}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke="#2563EB"
              strokeWidth={2.5}
              fill="url(#glucoseFill)"
              dot={{ r: 4, fill: "#2563EB", strokeWidth: 0 }}
              activeDot={{
                r: 7,
                fill: "#2563EB",
                stroke: "#fff",
                strokeWidth: 3,
                className: "drop-shadow-md transition-all duration-150",
              }}
              isAnimationActive
              animationDuration={700}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GlucoseTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-3.5 py-2.5 animate-in fade-in duration-150">
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-900">
        {payload[0].value} mg/dL
      </p>
    </div>
  );
}

/* ---------------------------- AI insight card ---------------------------- */

function AiInsightCard() {
  return (
    <div className="relative bg-gradient-to-br from-blue-600 to-sky-400 rounded-2xl p-6 text-white overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl min-h-[220px] flex flex-col justify-between">
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute -right-2 bottom-10 w-20 h-20 rounded-full bg-white/10" />

      <div className="relative z-10">
        <p className="text-xs font-semibold tracking-wide text-blue-100 mb-2">
          AI HEALTH SCORE
        </p>
        <p className="text-4xl font-semibold">82</p>
        <p className="text-sm text-blue-100 mt-1">out of 100</p>
      </div>

      <p className="relative z-10 text-sm text-blue-50 leading-relaxed">
        Your metabolic markers are trending upward. Keep an eye on LDL —
        small dietary shifts now could prevent a bigger correction later.
      </p>
    </div>
  );
}

/* --------------------------- Follow-up card --------------------------- */

function FollowUpCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 transition-shadow duration-300 hover:shadow-lg">
      <h3 className="font-semibold text-slate-900 mb-4">
        Recommended Follow-up
      </h3>

      <div className="flex flex-col gap-3">
        {followUps.map(({ icon: Icon, title, due }) => (
          <div
            key={title}
            className="group flex items-center gap-3 p-3 rounded-xl border border-slate-100 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50/40 hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
              <Icon size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{title}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wide">
                {due}
              </p>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full mt-4 border border-blue-200 text-blue-600 text-sm font-medium py-2.5 rounded-xl transition-all duration-200 hover:bg-blue-600 hover:text-white hover:shadow-md">
        Schedule via ABHA
      </button>
    </div>
  );
}

/* -------------------------- Physician summary -------------------------- */

function PhysicianSummary() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 mt-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 transition-shadow duration-300 hover:shadow-lg">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">
          Physician's Summary
        </h2>

        <div className="flex flex-col gap-6">
          <SummaryItem
            dot="bg-emerald-500"
            title="Hematology Findings"
            body="Red blood cell count and hemoglobin levels are robust, suggesting optimal iron levels and oxygen transport capacity. No immediate concerns in the CBC profile."
          />
          <SummaryItem
            dot="bg-orange-400"
            title="Metabolic Health"
            body="While fasting glucose is stable, the upward trend in LDL suggests a shift in lipid processing. Clinically correlated with recent lifestyle survey data."
          />
        </div>
      </div>

      <div className="group relative rounded-2xl overflow-hidden">
        <div className="w-full h-full min-h-[220px] bg-gradient-to-br from-slate-700 to-slate-500 transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <p className="text-white text-sm font-semibold">
            Lab Facility: Apollo Precision Diagnostics
          </p>
          <p className="text-white/70 text-xs mt-0.5">
            Verified ABHA Integrated Report
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ dot, title, body }) {
  return (
    <div className="flex gap-3">
      <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${dot}`} />
      <div>
        <p className="font-medium text-slate-900 mb-1">{title}</p>
        <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

/* -------------------------------- Footer -------------------------------- */

function Footer() {
  return (
    <footer className="mt-10 pt-8 border-t border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <ShieldCheck size={15} className="text-white" />
            </div>
            <span className="font-semibold text-slate-900">Swastha</span>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Intelligent health monitoring for the modern world. HIPAA and
            ABHA compliant digital infrastructure.
          </p>
        </div>

        <FooterColumn
          title="Platform"
          links={["Features", "Security Architecture", "API Docs"]}
        />
        <FooterColumn
          title="Support"
          links={["Privacy Policy", "Terms of Service", "Contact Support"]}
        />

        <div>
          <p className="font-semibold text-slate-900 mb-3 text-sm">
            Compliance
          </p>
          <div className="flex gap-3">
            {[ShieldCheck, Lock].map((Icon, i) => (
              <div
                key={i}
                className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 hover:-translate-y-0.5"
              >
                <Icon size={16} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          © 2024 Swastha Healthcare SaaS. HIPAA &amp; ABHA Compliant.
        </p>
        <div className="flex gap-3 text-slate-300">
          <QrCode size={16} />
          <Fingerprint size={16} />
          <AtSign size={16} />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <p className="font-semibold text-slate-900 mb-3 text-sm">{title}</p>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link}>
            <a
              href="#"
              className="text-sm text-slate-400 transition-colors duration-200 hover:text-blue-600"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}