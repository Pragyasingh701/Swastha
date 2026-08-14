import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { authService } from "../../../services/auth";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import SettingsModal from "../../settings/components/SettingsModal";
import ThemeToggle from "../../../components/Common/ThemeToggle";
import Logo from "../../../components/Common/Logo";

import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Bell,
  Settings,
  HelpCircle,
  PlusCircle,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Sparkles,
  ChevronRight,
  LogOut,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";


// ---- Mock data (swap with real API data later) ----
const hba1cData = [
  { month: "Jan", value: 6.9 },
  { month: "Feb", value: 6.7 },
  { month: "Mar", value: 6.5 },
  { month: "Apr", value: 6.6 },
  { month: "May", value: 6.5 },
  { month: "Jun", value: 6.8 },
];

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, active: true, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

const recentUploads = [
  {
    icon: FileText,
    title: "Complete Blood Count (CBC)",
    subtitle: "Apollo Diagnostics • Oct 12, 2024",
    status: "AI Processed",
  },
  {
    icon: ClipboardList,
    title: "Cardiology Prescription",
    subtitle: "Dr. Sarah Williams • Oct 10, 2024",
    status: "AI Processed",
  },
];

const medications = [
  {
    name: "Telmisartan 40mg",
    schedule: "Daily • After Breakfast",
    color: "bg-blue-600",
  },
  {
    name: "Metformin 500mg",
    schedule: "Twice Daily • With Meals",
    color: "bg-orange-500",
  },
];

const statCards = [
  {
    icon: FileText,
    tag: "+3 this week",
    value: "24",
    label: "Total Reports",
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    icon: Users,
    tag: null,
    value: "4",
    label: "Family Members",
    iconBg: "bg-blue-50 text-blue-600",
  },
  {
    icon: AlertTriangle,
    tag: "Action Required",
    tagColor: "text-orange-600",
    value: "2",
    label: "Medicine Alerts",
    iconBg: "bg-orange-50 text-orange-600",
  },
  {
    icon: ClipboardList,
    tag: "In 2 days",
    value: "1",
    label: "Upcoming Checkups",
    iconBg: "bg-blue-50 text-blue-600",
  },
];

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
          onClick={() => navigate('/family-vault')}
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

function Header({ profile }) {
  const navigate = useNavigate();

  return (
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

      <ProfileDropdown customProfile={profile} />
    </header>
  );
}

function StatCard({ icon: Icon, tag, tagColor, value, label, iconBg }) {
  return (
    <div className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-black/30 hover:border-slate-300 dark:hover:border-slate-700">
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg} transition-transform duration-300 group-hover:scale-110`}
        >
          <Icon size={18} />
        </div>
        {tag && (
          <span className={`text-xs font-medium ${tagColor || "text-slate-400 dark:text-slate-500"}`}>
            {tag}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
    </div>
  );
}

function Hba1cChart() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 transition-all duration-300 hover:shadow-lg dark:hover:shadow-black/30 hover:border-slate-300 dark:hover:border-slate-700">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            HbA1c Lab Trends
          </h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
            Clinical tracking over last 6 months
          </p>
        </div>
        <span className="text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full">
          Normal Range
        </span>
      </div>

      <div className="h-56 mt-4 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={hba1cData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }}
              activeDot={{ r: 7, fill: "#2563eb", stroke: "#fff", strokeWidth: 3 }}
              isAnimationActive
              animationDuration={600}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl p-4 mt-2 transition-colors duration-200 hover:bg-slate-100/70 dark:hover:bg-slate-800">
        <Sparkles size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">AI Observation: </span>
          Your HbA1c has decreased by 0.4% since last quarter. This indicates
          excellent glycemic control through your recent dietary changes.
        </p>
      </div>
    </div>
  );
}

function RecentUploads() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Recent Uploads
        </h3>
        <button className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
          View All
        </button>
      </div>

      <div className="space-y-3">
        {recentUploads.map(({ icon: Icon, title, subtitle, status }) => (
          <div
            key={title}
            className="flex items-center gap-4 border border-slate-100 dark:border-slate-800 rounded-lg p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
              <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                {title}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>
            </div>
            <span className="text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-full whitespace-nowrap">
              {status}
            </span>
            <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentMedications() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Current Medications
        </h3>
        <button className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          REFILL ALL
        </button>
      </div>

      <div className="space-y-3">
        {medications.map(({ name, schedule, color }) => (
          <div key={name} className="flex items-center gap-3">
            <span className={`w-1.5 h-10 rounded-full ${color}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{schedule}</p>
            </div>
            <span className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { token, user: cachedUser, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState(cachedUser);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      if (!isAuthenticated || !token) {
        setProfile(cachedUser);
        return;
      }

      setIsProfileLoading(true);
      try {
        const result = await authService.getProfile(token);
        if (isMounted && result?.user) {
          setProfile(result.user);
        }
      } catch {
        if (isMounted) {
          setProfile(cachedUser);
        }
      } finally {
        if (isMounted) {
          setIsProfileLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [cachedUser, isAuthenticated, token]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header profile={profile} />

        <main className="flex-1 overflow-y-auto px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Welcome back, {profile?.name || 'User'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {isProfileLoading
                  ? 'Loading your profile from the database...'
                  : profile?.role
                    ? `${profile.role.charAt(0).toUpperCase() + profile.role.slice(1)} profile from the database.`
                    : 'Your clinical intelligence overview for today.'}
              </p>
            </div>
            <span className="flex items-center gap-2 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-sm font-medium px-4 py-2 rounded-lg">
              <ShieldCheck size={16} />
              {profile?.email ? 'Profile Synced' : 'ABHA Synced'}
            </span>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/family-vault')}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5"
            >
              <Users size={16} />
              Open Family Vault
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <Hba1cChart />
              <RecentUploads />
            </div>

            <div className="space-y-6">
              <CurrentMedications />
            </div>
          </div>
        </main>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}