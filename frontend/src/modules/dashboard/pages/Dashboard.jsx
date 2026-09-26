import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { authService } from "../../../services/auth";
import { getFamilyDashboard } from "../../../api/family";
import { getTimelineReports } from "../../../api/reports";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import SettingsModal from "../../settings/components/SettingsModal";
import Logo from "../../../components/Common/Logo";
import ResponsiveSidebar from "../../../components/Common/ResponsiveSidebar";
import PatientIdBadge from "../../../components/Common/PatientIdBadge";
import NotificationBell from "../../../components/Common/NotificationBell";

import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  ClipboardList,
  Settings,
  PlusCircle,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Sparkles,
  ChevronRight,
  LogOut,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, active: true, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

function parseMedicationEntries(reports = []) {
  const meds = [];
  const seen = new Set();

  const normalizeMedicationKey = (value = '') => {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  for (const report of reports) {
    const category = String(report?.category || '').toLowerCase();
    if (category && category !== 'prescription' && category !== 'prescriptions' && category !== 'consultation') {
      continue;
    }

    const sourceText = String(report?.medicines || '').trim();
    if (!sourceText) continue;

    const lines = sourceText
      .split(/\r?\n|\s*;\s*/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const cleaned = line.replace(/^[•*\-\d.\s]+/, '').trim();
      if (!cleaned) continue;

      const separatorIndex = cleaned.search(/\s*[-–—]\s*/);
      const name = separatorIndex >= 0 ? cleaned.slice(0, separatorIndex).trim() : cleaned;
      const schedule = separatorIndex >= 0 ? cleaned.slice(separatorIndex + 1).trim() : 'As prescribed';
      const finalName = name || cleaned;
      const cleanedName = finalName.replace(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%|tablet|tablets|capsule|capsules)\s*$/i, '').trim();
      const key = normalizeMedicationKey(cleanedName || finalName);

      if (seen.has(key)) continue;
      seen.add(key);
      meds.push({
        name: cleanedName || finalName,
        schedule: schedule || 'As prescribed',
        color: meds.length % 2 === 0 ? 'bg-blue-600' : 'bg-orange-500',
      });
    }
  }

  return meds;
}

function Sidebar({ onOpenSettings }) {
  return (
    <ResponsiveSidebar
      navItems={navItems}
      action={{ label: "Open Family Vault", icon: PlusCircle, route: "/family-vault" }}
      onOpenSettings={onOpenSettings}
    />
  );
}

function Header({ profile }) {
  return (
    <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
      <NotificationBell />

      <PatientIdBadge customProfile={profile} />

      <ProfileDropdown customProfile={profile} />
    </header>
  );
}

function StatCard({ icon: Icon, tag, tagColor, value, label, iconBg }) {
  return (
    <div className="group bg-white border border-slate-200 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-slate-300 ">
      <div className="flex items-start justify-between mb-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg} transition-transform duration-300 group-hover:scale-110`}
        >
          <Icon size={18} />
        </div>
        {tag && (
          <span className={`text-xs font-medium ${tagColor || "text-slate-400 "}`}>
            {tag}
          </span>
        )}
      </div>
      <p className="text-3xl font-bold text-slate-900 ">{value}</p>
      <p className="text-sm text-slate-500 mt-1">{label}</p>
    </div>
  );
}

function formatReportDate(value) {
  if (!value) return 'Date not available';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not available';

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function RecentUploads({ reports = [] }) {
  const navigate = useNavigate();
  const recentReports = reports.slice(0, 5);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 ">
          Recent Uploads
        </h3>
        <button
          type="button"
          onClick={() => navigate('/vault')}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          View All
        </button>
      </div>

      <div className="space-y-3">
        {recentReports.length === 0 ? (
          <p className="text-sm text-slate-500">No documents uploaded yet.</p>
        ) : recentReports.map((report) => {
          const Icon = report.category?.toLowerCase().includes('prescription') ? ClipboardList : FileText;
          const subtitle = [report.doctor, report.hospital, formatReportDate(report.reportDate || report.createdAt)]
            .filter(Boolean)
            .join(' • ');

          return (
          <div
            key={report.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/vault?document=${encodeURIComponent(report.id)}`)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate(`/vault?document=${encodeURIComponent(report.id)}`);
              }
            }}
            className="flex items-center gap-4 border border-slate-100 rounded-lg p-4 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {report.title || report.category || 'Medical document'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{subtitle || formatReportDate(report.reportDate || report.createdAt)}</p>
            </div>
            <span className="text-xs font-medium bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full whitespace-nowrap">
              {report.analysis ? 'AI Processed' : 'Uploaded'}
            </span>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </div>
          );
        })}
      </div>
    </div>
  );
}

function CurrentMedications({ medications = [] }) {
  const [isMedicationModalOpen, setIsMedicationModalOpen] = useState(false);
  const visibleMedications = medications.slice(0, 5);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900 ">
          Current Medications
        </h3>
        <button
          type="button"
          onClick={() => setIsMedicationModalOpen(true)}
          disabled={medications.length === 0}
          className="text-xs font-semibold text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
        >
          VIEW ALL
        </button>
      </div>

      <div className="space-y-3">
        {medications.length === 0 ? (
          <p className="text-sm text-slate-500">No active medications found in your uploaded reports.</p>
        ) : (
          visibleMedications.map(({ name, schedule, color }) => (
            <div key={name} className="flex items-center gap-3">
              <span className={`w-1.5 h-10 rounded-full ${color}`} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{schedule}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {isMedicationModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4" onClick={() => setIsMedicationModalOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Medication list</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">All medications</h2>
              </div>
              <button type="button" onClick={() => setIsMedicationModalOpen(false)} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close medication list">&times;</button>
            </div>

            <div className="mt-5 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {medications.length === 0 ? (
                <p className="text-sm text-slate-500">No active medications found in your uploaded reports.</p>
              ) : (
                medications.map(({ name, schedule, color }) => (
                  <div key={`${name}-modal`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <span className={`h-8 w-1.5 rounded-full ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{schedule}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { token, user: cachedUser, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState(cachedUser);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [vaultReports, setVaultReports] = useState([]);
  const [familySummary, setFamilySummary] = useState({
    totalMembers: 0,
    upcomingCheckups: 0,
    relationshipTagCount: 0,
    membersWithHealthNotes: 0,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadFamilySummary() {
      if (!isAuthenticated || !token) {
        setFamilySummary({
          totalMembers: 0,
          upcomingCheckups: 0,
          relationshipTagCount: 0,
          membersWithHealthNotes: 0,
        });
        return;
      }

      try {
        const result = await getFamilyDashboard(token);
        if (!isMounted) return;
        setFamilySummary(result?.summary || {
          totalMembers: 0,
          upcomingCheckups: 0,
          relationshipTagCount: 0,
          membersWithHealthNotes: 0,
        });
      } catch {
        if (isMounted) {
          setFamilySummary({
            totalMembers: 0,
            upcomingCheckups: 0,
            relationshipTagCount: 0,
            membersWithHealthNotes: 0,
          });
        }
      }
    }

    async function loadVaultReports() {
      if (!isAuthenticated || !token) {
        setVaultReports([]);
        return;
      }

      try {
        const result = await getTimelineReports(token);
        if (!isMounted) return;
        const list = Array.isArray(result?.reports) ? result.reports : [];
        setVaultReports(list);
      } catch {
        if (isMounted) {
          setVaultReports([]);
        }
      }
    }

    loadVaultReports();
    loadFamilySummary();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, token]);

  const medications = useMemo(() => parseMedicationEntries(vaultReports), [vaultReports]);

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

  const statCards = [
    {
      icon: FileText,
      tag: null,
      value: String(vaultReports.length || 0),
      label: "Total Documents",
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      icon: Users,
      tag: null,
      value: String(familySummary.totalMembers || 0),
      label: "Family Members",
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      icon: AlertTriangle,
      tag: medications.length > 0 ? "Active meds" : "No alerts",
      tagColor: "text-orange-600",
      value: String(medications.length || 0),
      label: "Medicine Alerts",
      iconBg: "bg-orange-50 text-orange-600",
    },
    {
      icon: ClipboardList,
      tag: familySummary.upcomingCheckups > 0 ? "In next 30 days" : null,
      value: String(familySummary.upcomingCheckups || 0),
      label: "Upcoming Checkups",
      iconBg: "bg-blue-50 text-blue-600",
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 ">
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header profile={profile} />

        <main className="flex-1 overflow-y-auto px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 ">
                Welcome back, {profile?.name || 'User'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {isProfileLoading
                  ? 'Loading your profile from the database...'
                  : profile?.role
                    ? `${profile.role.charAt(0).toUpperCase() + profile.role.slice(1)} profile from the database.`
                    : 'Your clinical intelligence overview for today.'}
              </p>
            </div>
            <span className="flex items-center gap-2 bg-blue-50 text-blue-700 text-sm font-medium px-4 py-2 rounded-lg">
              <ShieldCheck size={16} />
              {profile?.email ? 'Profile Synced' : 'ABHA Synced'}
            </span>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/intake')}
              className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-blue-800 hover:shadow-md hover:-translate-y-0.5"
            >
              <ClipboardList size={16} />
              Start Visit Intake
            </button>
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
              <RecentUploads reports={vaultReports} />
            </div>

            <div className="space-y-6">
              <CurrentMedications medications={medications} />
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