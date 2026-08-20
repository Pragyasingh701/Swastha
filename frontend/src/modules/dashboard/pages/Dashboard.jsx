import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { authService } from "../../../services/auth";
import { getFamilyDashboard } from "../../../api/family";
import { getTimelineReports } from "../../../api/reports";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import SettingsModal from "../../settings/components/SettingsModal";
import Logo from "../../../components/Common/Logo";
import PatientIdBadge from "../../../components/Common/PatientIdBadge";
import { usePolling } from "../../../hooks/usePolling";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications,
} from "../../../utils/notifications";
import { acceptDoctorRequest, declineDoctorRequest } from "../../../services/doctorPatients";

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
  Check,
  X,
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
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 border-r border-slate-200 h-screen overflow-y-auto px-4 py-6">
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
                  ? "bg-blue-100 text-blue-700 "
                  : "text-slate-600 hover:bg-slate-100 "
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 "
          >
            <Settings size={18} />
            Settings
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 ">
            <HelpCircle size={18} />
            Support
          </button>
        </div>
      </div>
    </aside>
  );
}

function Header({
  profile,
  token,
  isNotificationsOpen,
  setIsNotificationsOpen,
  notifications,
  onMarkRead,
  onMarkAllRead,
  resolvedLinkIds,
  busyLinkId,
  requestError,
  onAcceptRequest,
  onDeclineRequest,
}) {
  const navigate = useNavigate();
  const [selectedNotification, setSelectedNotification] = useState(null);
  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
      <button
        type="button"
        onClick={() => navigate('/search')}
        className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600 "
      >
        <Sparkles size={16} />
        Ask Swastha about your health records...
      </button>

      <div className="relative" data-notification-menu>
        <button
          type="button"
          onClick={() => setIsNotificationsOpen((value) => !value)}
          className="relative p-2 rounded-lg hover:bg-slate-100 shrink-0 transition-colors"
          aria-label="Open notifications"
        >
          <Bell size={20} className="text-slate-600" />
          {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />}
        </button>

        {isNotificationsOpen && (
          <div className="absolute right-0 top-full mt-3 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl z-50">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              <button
                type="button"
                onClick={onMarkAllRead}
                disabled={unreadCount === 0}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400"
              >
                {unreadCount > 0 ? `${unreadCount} new` : 'All read'}
              </button>
            </div>

            {requestError && (
              <p className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{requestError}</p>
            )}

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-500">No activity yet.</p>
              ) : (
                notifications.map((item) => {
                  const linkId = item.metadata?.linkId;
                  // See PatientNotifications.jsx for the full explanation.
                  // resolvedLinkIds covers this-session clicks in THIS
                  // bell; metadata.linkStatus (stamped server-side on every
                  // fetch) covers a request already resolved via the OTHER
                  // channel — the email Accept/Decline link.
                  const linkStatus = item.metadata?.linkStatus;
                  const isActionableRequest =
                    item.eventType === 'doctor_request' &&
                    linkId &&
                    !resolvedLinkIds.has(linkId) &&
                    (!linkStatus || linkStatus === 'pending');

                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedNotification(item);
                        onMarkRead(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setSelectedNotification(item);
                          onMarkRead(item);
                        }
                      }}
                      className="w-full flex items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50 last:border-b-0 cursor-pointer"
                    >
                      <span
                        title={item.read ? "Read" : "Unread"}
                        aria-label={item.read ? "Read notification" : "Unread notification"}
                        className={`mt-2 h-2.5 w-2.5 rounded-full shrink-0 ${item.read ? "bg-slate-300" : "bg-red-500"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-800">{item.title}</p>
                          {!item.read && (
                            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600">
                              New
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>

                        {isActionableRequest && (
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={busyLinkId === linkId}
                              onClick={(event) => onAcceptRequest(event, linkId)}
                              className="flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Check size={12} />
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={busyLinkId === linkId}
                              onClick={(event) => onDeclineRequest(event, linkId)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <X size={12} />
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              className="w-full border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              View all activity
            </button>
          </div>
        )}

        {selectedNotification && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4" onClick={() => setSelectedNotification(null)}>
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Notification details</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">{selectedNotification.title}</h2>
                </div>
                <button type="button" onClick={() => setSelectedNotification(null)} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close notification details">&times;</button>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-700">{selectedNotification.message}</p>
              <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex justify-between gap-4"><span>Received</span><span className="text-right font-medium text-slate-800">{new Date(selectedNotification.createdAt).toLocaleString()}</span></div>
                <div className="flex justify-between gap-4"><span>Event</span><span className="text-right font-medium text-slate-800">{selectedNotification.eventType || selectedNotification.type || 'Activity'}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [vaultReports, setVaultReports] = useState([]);
  const [familySummary, setFamilySummary] = useState({
    totalMembers: 0,
    upcomingCheckups: 0,
    relationshipTagCount: 0,
    membersWithHealthNotes: 0,
  });
  // linkIds accepted/declined this session — see PatientNotifications.jsx
  // for why this (not the notification row itself) is what hides the
  // Accept/Decline buttons: accepting/declining creates a SEPARATE
  // notification for the doctor, it doesn't change this notification.
  const [resolvedLinkIds, setResolvedLinkIds] = useState(() => new Set());
  const [busyLinkId, setBusyLinkId] = useState(null);
  const [requestError, setRequestError] = useState(null);

  async function loadNotifications() {
    if (!profile || !token || profile.role === 'doctor') {
      setNotifications([]);
      return;
    }

    try {
      const result = await fetchNotifications(token);
      setNotifications(result.notifications);
    } catch {
      setNotifications(readNotifications(profile));
    }
  }

  useEffect(() => {
    loadNotifications();

    const onNotificationUpdate = () => {
      loadNotifications();
    };

    window.addEventListener('patientNotification', onNotificationUpdate);
    return () => {
      window.removeEventListener('patientNotification', onNotificationUpdate);
    };
  }, [profile, token]);

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

  // The 'patientNotification' event above only fires from code running in
  // THIS tab (see PatientNotifications.jsx for the full reasoning) — this
  // is what makes a new doctor request, or an accept/decline from another
  // tab/device, actually show up here without a hard refresh.
  usePolling(loadNotifications, { intervalMs: 20000 });

  async function handleAcceptDoctorRequest(event, linkId) {
    event.stopPropagation();
    setBusyLinkId(linkId);
    setRequestError(null);
    try {
      await acceptDoctorRequest(linkId);
      setResolvedLinkIds((prev) => new Set(prev).add(linkId));
    } catch (err) {
      setRequestError(err.message || 'Could not accept this request.');
    } finally {
      setBusyLinkId(null);
    }
  }

  async function handleDeclineDoctorRequest(event, linkId) {
    event.stopPropagation();
    setBusyLinkId(linkId);
    setRequestError(null);
    try {
      await declineDoctorRequest(linkId);
      setResolvedLinkIds((prev) => new Set(prev).add(linkId));
    } catch (err) {
      setRequestError(err.message || 'Could not decline this request.');
    } finally {
      setBusyLinkId(null);
    }
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (!event.target.closest("[data-notification-menu]")) {
        setIsNotificationsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        <Header
          profile={profile}
          token={token}
          isNotificationsOpen={isNotificationsOpen}
          setIsNotificationsOpen={setIsNotificationsOpen}
          notifications={notifications}
          onMarkRead={async (item) => {
            if (item.read || !item.id) return;
            try {
              const updated = await markNotificationRead(token, item.id);
              if (updated) {
                setNotifications((current) => current.map((entry) => entry.id === item.id ? updated : entry));
              }
            } catch {
              // Keep the notification visible if the API is temporarily unavailable.
            }
          }}
          onMarkAllRead={async () => {
            try {
              await markAllNotificationsRead(token);
              setNotifications((current) => current.map((item) => ({ ...item, read: true })));
            } catch {
              // Keep the current state if the API is temporarily unavailable.
            }
          }}
          resolvedLinkIds={resolvedLinkIds}
          busyLinkId={busyLinkId}
          requestError={requestError}
          onAcceptRequest={handleAcceptDoctorRequest}
          onDeclineRequest={handleDeclineDoctorRequest}
        />

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