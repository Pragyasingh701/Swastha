import React, { useState, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Logo from "../../../../components/Common/Logo";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  Bell,
  Settings,
  HelpCircle,
  PlusCircle,
  HeartPulse,
  ArrowDown,
  ArrowUp,
  Minus,
  Sparkles,
  FlaskConical,
  Syringe,
  Loader2,
  RefreshCw,
  Beaker,
} from "lucide-react";
import { useAuth } from "../../../../context/AuthContext";
import { getLabInsights } from "../../../../api/reports";
import SettingsModal from "../../../settings/components/SettingsModal";
import ThemeToggle from "../../../../components/Common/ThemeToggle";
import ProfileDropdown from "../../../settings/components/ProfileDropdown";

// Same nav list as Dashboard.jsx, with Lab Insights marked active
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, active: true, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

const toneStyles = {
  good: {
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
    barBg: "bg-emerald-500",
    statusText: "text-emerald-500 dark:text-emerald-400",
    deltaBg: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  watch: {
    iconBg: "bg-orange-50 dark:bg-orange-500/10 text-orange-500 dark:text-orange-400",
    barBg: "bg-orange-400",
    statusText: "text-orange-500 dark:text-orange-400",
    deltaBg: "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
    dot: "bg-orange-400",
  },
  neutral: {
    iconBg: "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400",
    barBg: "bg-blue-400",
    statusText: "text-slate-400 dark:text-slate-500",
    deltaBg: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
    dot: "bg-blue-400",
  },
};

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// A test is "trending up/down" if the latest value differs from the
// previous one — used to color the delta badge on the stat card. Flat if
// there's only one data point or no real change.
function computeDelta(points) {
  if (points.length < 2) return { dir: "flat", text: "New" };
  const latest = points[points.length - 1].value;
  const prev = points[points.length - 2].value;
  const diff = latest - prev;
  if (Math.abs(diff) < 0.01) return { dir: "flat", text: "Stable" };
  return {
    dir: diff > 0 ? "up" : "down",
    text: `${Math.abs(diff).toFixed(diff % 1 === 0 ? 0 : 1)}`,
  };
}

export default function LabInsights() {
  const { token, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [insights, setInsights] = useState(null);
  const [labReportCount, setLabReportCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTest, setActiveTest] = useState(null);
  const [range, setRange] = useState("All");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setInsights(null);
      setLabReportCount(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getLabInsights(token)
      .then((response) => {
        if (cancelled) return;
        setInsights(response?.insights || null);
        setLabReportCount(response?.labReportCount || 0);
        const firstTest = response?.insights?.series?.[0]?.testName || null;
        setActiveTest(firstTest);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load lab insights:", err);
        setError(err.message || "Failed to load lab insights.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token]);

  const series = insights?.series || [];
  const activeSeries = useMemo(
    () => series.find((s) => s.testName === activeTest) || series[0] || null,
    [series, activeTest]
  );

  const chartData = useMemo(() => {
    if (!activeSeries) return [];
    const points = range === "Recent" ? activeSeries.points.slice(-6) : activeSeries.points;
    return points.map((p) => ({ label: formatDateLabel(p.date), value: p.value, date: p.date }));
  }, [activeSeries, range]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
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

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8 min-w-0 overflow-x-hidden">
        <PageHeader />

        {loading && <LoadingState />}

        {!loading && error && <ErrorState message={error} />}

        {!loading && !error && labReportCount === 0 && <EmptyState navigate={navigate} />}

        {!loading && !error && labReportCount > 0 && !insights && (
          <ErrorState message="Could not generate lab insights from your reports. Please try again later." />
        )}

        {!loading && !error && insights && (
          <>
            <StatRow series={series} activeTest={activeTest} setActiveTest={setActiveTest} />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-6">
              {activeSeries ? (
                <TrendCard
                  activeSeries={activeSeries}
                  chartData={chartData}
                  range={range}
                  setRange={setRange}
                />
              ) : (
                <NoNumericDataCard />
              )}
              <div className="flex flex-col gap-6">
                <AiInsightCard healthScore={insights.healthScore} note={insights.healthScoreNote} />
                <FollowUpCard followUps={insights.followUps} />
              </div>
            </div>

            <PhysicianSummary items={insights.physicianSummary} />
          </>
        )}
      </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

/* ------------------------------ Sidebar ------------------------------ */
/* Copied from Dashboard.jsx so both pages share identical behavior. */

function Sidebar({ onOpenSettings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen overflow-y-auto px-4 py-6">
      <div className="px-2 mb-8">
        <Logo />
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
                  ? "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
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
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Settings size={18} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
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
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold text-slate-900 dark:text-slate-100 leading-snug">
          Lab Insights
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          AI-powered trend analysis across your lab reports.
        </p>
      </div>
    </div>
  );
}

/* --------------------------- Loading / empty / error states --------------------------- */

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400 dark:text-slate-500">
      <Loader2 size={28} className="animate-spin text-blue-500" />
      <p className="text-sm">Analyzing your lab reports…</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

function EmptyState({ navigate }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-10 text-center flex flex-col items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center">
        <FlaskConical size={22} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">No Lab Reports yet</h2>
      <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm">
        Upload a Lab Report to start seeing AI-extracted trends, a health score, and
        follow-up suggestions here.
      </p>
      <button
        type="button"
        onClick={() => navigate('/timeline')}
        className="mt-2 bg-blue-700 hover:bg-blue-800 transition-colors text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
      >
        Upload a Lab Report
      </button>
    </div>
  );
}

function NoNumericDataCard() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-8 text-center flex flex-col items-center justify-center gap-3 min-h-[280px]">
      <Beaker size={22} className="text-slate-300 dark:text-slate-600" />
      <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs">
        Your Lab Reports don't include any extractable numeric results yet
        (e.g. "HbA1c 5.4%") — add specific values to the Key Results field to
        see a trend chart here.
      </p>
    </div>
  );
}

/* ---------------------------- Stat cards ---------------------------- */

function StatRow({ series, activeTest, setActiveTest }) {
  if (series.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      {series.slice(0, 3).map((s) => (
        <StatCard
          key={s.testName}
          series={s}
          isActive={s.testName === activeTest}
          onClick={() => setActiveTest(s.testName)}
        />
      ))}
    </div>
  );
}

function StatCard({ series, isActive, onClick }) {
  const latest = series.points[series.points.length - 1];
  const delta = computeDelta(series.points);
  const DeltaIcon = delta.dir === "up" ? ArrowUp : delta.dir === "down" ? ArrowDown : Minus;
  // No fixed "healthy/action" verdict without real reference-range logic —
  // keep the tone neutral/informational rather than guessing a status.
  const tone = toneStyles.neutral;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left bg-white dark:bg-slate-900 rounded-2xl border shadow-sm p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        isActive
          ? "border-blue-300 dark:border-blue-500/40 ring-1 ring-blue-100 dark:ring-blue-500/20"
          : "border-slate-100 dark:border-slate-800"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone.iconBg} transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}
        >
          <HeartPulse size={18} />
        </div>
        <span
          className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${tone.deltaBg}`}
        >
          <DeltaIcon size={11} />
          {delta.text}
        </span>
      </div>

      <p className="text-sm text-slate-400 dark:text-slate-500 mb-1">{series.testName}</p>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {latest.value}{series.unit ? ` ${series.unit}` : ""}
        </span>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        {series.normalRange ? `Normal range: ${series.normalRange}` : `${series.points.length} recorded value${series.points.length === 1 ? "" : "s"}`}
      </p>
    </button>
  );
}

/* ------------------------- Trend card ------------------------- */

function TrendCard({ activeSeries, chartData, range, setRange }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 transition-shadow duration-300 hover:shadow-lg">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {activeSeries.testName} Trend
          </h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Extracted from your uploaded Lab Reports
            {activeSeries.normalRange ? ` · Normal range: ${activeSeries.normalRange}${activeSeries.unit ? ` ${activeSeries.unit}` : ""}` : ""}
          </p>
        </div>

        {activeSeries.points.length > 6 && (
          <div className="flex bg-slate-50 dark:bg-slate-800 rounded-xl p-1">
            {["All", "Recent"].map((option) => (
              <button
                key={option}
                onClick={() => setRange(option)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                  range === option
                    ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-medium shadow-sm"
                    : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-80 mt-4 -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="glucoseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke="#EEF1F6" />

            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94A3B8", fontSize: 12 }}
            />
            <YAxis hide domain={['auto', 'auto']} />

            <Tooltip
              cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
              content={<TrendTooltip unit={activeSeries.unit} />}
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

function TrendTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-100 dark:border-slate-800 px-3.5 py-2.5 animate-in fade-in duration-150">
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {payload[0].value}{unit ? ` ${unit}` : ""}
      </p>
    </div>
  );
}

/* ---------------------------- AI insight card ---------------------------- */

function AiInsightCard({ healthScore, note }) {
  return (
    <div className="relative bg-gradient-to-br from-blue-600 to-sky-400 rounded-2xl p-6 text-white overflow-hidden transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl min-h-[220px] flex flex-col justify-between">
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10" />
      <div className="absolute -right-2 bottom-10 w-20 h-20 rounded-full bg-white/10" />

      <div className="relative z-10">
        <p className="text-xs font-semibold tracking-wide text-blue-100 mb-2">
          AI HEALTH SCORE
        </p>
        {healthScore != null ? (
          <>
            <p className="text-4xl font-semibold">{healthScore}</p>
            <p className="text-sm text-blue-100 mt-1">out of 100</p>
          </>
        ) : (
          <p className="text-sm text-blue-100 mt-1">Not enough data yet</p>
        )}
      </div>

      <p className="relative z-10 text-sm text-blue-50 leading-relaxed">
        {note || "Upload more Lab Reports to get a personalized health score."}
      </p>
    </div>
  );
}

/* --------------------------- Follow-up card --------------------------- */

function FollowUpCard({ followUps }) {
  const items = followUps || [];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 transition-shadow duration-300 hover:shadow-lg">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">
        Recommended Follow-up
      </h3>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No follow-up suggestions right now — nothing in your records points to one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(({ title, reason }) => (
            <div
              key={title}
              className="group flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 transition-all duration-200 hover:border-blue-200 dark:hover:border-blue-500/30 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 hover:-translate-y-0.5"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center transition-transform duration-200 group-hover:scale-110 shrink-0">
                <Syringe size={16} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
                {reason && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">{reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------- Physician summary -------------------------- */

function PhysicianSummary({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 sm:p-8 mt-6 transition-shadow duration-300 hover:shadow-lg">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">
          AI Physician's Summary
        </h2>

        <div className="flex flex-col gap-6">
          {items.map((item) => (
            <SummaryItem key={item.title} dot={toneStyles[item.tone]?.dot || toneStyles.neutral.dot} title={item.title} body={item.body} />
          ))}
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
        <p className="font-medium text-slate-900 dark:text-slate-100 mb-1">{title}</p>
        <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
