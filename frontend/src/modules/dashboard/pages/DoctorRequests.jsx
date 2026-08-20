import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../../../components/Common/Logo";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import PatientIdBadge from "../../../components/Common/PatientIdBadge";
import { useAuth } from "../../../context/AuthContext";
import {
  getPendingDoctorRequests,
  acceptDoctorRequest,
  declineDoctorRequest,
} from "../../../services/doctorPatients";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  Sparkles,
  Bell,
  Settings,
  HelpCircle,
  PlusCircle,
  Stethoscope,
  Check,
  X,
  Clock,
} from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Doctor Requests", icon: Stethoscope, route: "/doctor-requests", active: true },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

function Sidebar() {
  const navigate = useNavigate();

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-slate-50 border-r border-slate-200 h-screen overflow-y-auto px-4 py-6">
      <div className="px-2 mb-8">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ label, icon: Icon, active, route }) => (
          <button
            key={label}
            type="button"
            onClick={() => route && navigate(route)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active ? "bg-blue-100 text-blue-700 " : "text-slate-600 hover:bg-slate-100 "
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
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
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 ">
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

function Header({ profile }) {
  const navigate = useNavigate();

  return (
    <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
      <button
        type="button"
        onClick={() => navigate("/search")}
        className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600 "
      >
        <Sparkles size={16} />
        Ask Swastha about your health records...
      </button>

      <NotificationBell />

      <PatientIdBadge customProfile={profile} />

      <ProfileDropdown customProfile={profile} />
    </header>
  );
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function RequestCard({ request, onAccept, onDecline, isBusy }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-[0_4px_12px_rgba(15,23,42,0.05)] border border-slate-200">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Stethoscope size={22} />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-lg text-slate-900 truncate">{request.doctorName}</h3>
          {request.doctorSpecialty && (
            <p className="text-sm text-slate-500 truncate">{request.doctorSpecialty}</p>
          )}
          {request.doctorHospital && (
            <p className="text-sm text-slate-400 truncate">{request.doctorHospital}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-5">
        <Clock size={13} />
        Requested {formatDate(request.requestedAt)}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onAccept(request.linkId)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          <Check size={16} />
          Accept
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onDecline(request.linkId)}
          className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          <X size={16} />
          Decline
        </button>
      </div>
    </div>
  );
}

export default function DoctorRequests() {
  const { user: cachedUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyLinkId, setBusyLinkId] = useState(null);
  const [error, setError] = useState(null);

  async function loadRequests() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPendingDoctorRequests();
      setRequests(result);
    } catch (err) {
      setError(err.message || "Could not load doctor requests.");
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function handleAccept(linkId) {
    setBusyLinkId(linkId);
    setError(null);
    try {
      await acceptDoctorRequest(linkId);
      // Re-fetch rather than optimistically splice - the accepted request
      // must disappear from THIS list either way, and re-fetching is the
      // simplest way to stay correct if something else changed server-side.
      setRequests((prev) => prev.filter((r) => r.linkId !== linkId));
    } catch (err) {
      setError(err.message || "Could not accept this request.");
    } finally {
      setBusyLinkId(null);
    }
  }

  async function handleDecline(linkId) {
    setBusyLinkId(linkId);
    setError(null);
    try {
      await declineDoctorRequest(linkId);
      setRequests((prev) => prev.filter((r) => r.linkId !== linkId));
    } catch (err) {
      setError(err.message || "Could not decline this request.");
    } finally {
      setBusyLinkId(null);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 ">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Header profile={cachedUser} />

        <main className="flex-1 overflow-y-auto px-6 sm:px-10 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900">Doctor Requests</h1>
            <p className="text-slate-500 mt-1">
              Doctors who want to view your health records. Accepting gives them full access
              to your reports; declining is permanent - they cannot request again.
            </p>
          </div>

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-slate-400 text-sm">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              No pending doctor requests right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {requests.map((request) => (
                <RequestCard
                  key={request.linkId}
                  request={request}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  isBusy={busyLinkId === request.linkId}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
