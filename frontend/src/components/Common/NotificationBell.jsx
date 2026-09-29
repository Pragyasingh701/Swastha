import React, { useEffect, useRef, useState, useCallback } from "react";
import { Bell, Check, X, Stethoscope, CheckCircle2, XCircle } from "lucide-react";
import {
  getDoctorPatientNotifications,
  acceptDoctorRequest,
  declineDoctorRequest,
} from "../../services/doctorPatients";
import { usePolling } from "../../hooks/usePolling";

/**
 * Shared bell icon + dropdown for BOTH doctor and patient headers.
 * Backed by GET /api/doctor-patients/notifications, which dispatches on
 * the caller's own JWT role server-side (see
 * backend/routes/doctorPatients.js) — this component never needs to know
 * or pass which side it's on, it just renders whatever the server sent.
 *
 * The red dot on the bell counts only 'request'/'request-sent' entries
 * (an actual pending item needing attention) — accepted/declined events
 * are history, not something to badge as "new" forever.
 *
 * A PATIENT-side 'request' row is also actionable (Accept/Decline) right
 * here — the only side that ever needs this, since a doctor's own
 * 'request-sent' row is just history of a request THEY sent. Whether a
 * given 'request' is still pending is derived from the same notifications
 * list: getPatientNotifications (backend/db/doctorPatients.js) always
 * emits the original 'request' row PLUS a second 'accepted'/'declined' row
 * for the same linkId once resolved, so a request linkId with no such
 * partner row is still awaiting a response.
 */
export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [busyLinkId, setBusyLinkId] = useState(null);
  const [actionError, setActionError] = useState("");
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getDoctorPatientNotifications();
      setNotifications(result);
    } catch {
      // Silent — a broken bell is not worth surfacing an error banner for
      // on every single page it appears on.
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function handleAccept(event, linkId) {
    event.stopPropagation();
    setBusyLinkId(linkId);
    setActionError("");
    try {
      await acceptDoctorRequest(linkId);
      await load();
    } catch (err) {
      setActionError(err.message || "Could not accept this request.");
    } finally {
      setBusyLinkId(null);
    }
  }

  async function handleDecline(event, linkId) {
    event.stopPropagation();
    setBusyLinkId(linkId);
    setActionError("");
    try {
      await declineDoctorRequest(linkId);
      await load();
    } catch (err) {
      setActionError(err.message || "Could not decline this request.");
    } finally {
      setBusyLinkId(null);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  // The bell is mounted on every page, so its badge count must stay
  // correct even while the dropdown is closed — not just refresh when
  // opened. Polls every 20s while the tab is visible, and immediately on
  // window focus / tab-visibility regain (covers "accepted via email in
  // another tab, switched back here").
  usePolling(load, { intervalMs: 20000 });

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleToggle() {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) load(); // refresh on open, not just on mount
      return next;
    });
  }

  // A 'request' row's own type never changes once resolved — the resolved
  // status is a SECOND row (type 'accepted'/'declined') sharing the same
  // linkId, so "still pending" means no such partner row exists yet.
  const resolvedLinkIds = new Set(
    notifications.filter((n) => n.type === "accepted" || n.type === "declined").map((n) => n.linkId)
  );
  const pendingCount = notifications.filter(
    (n) => n.type === "request-sent" || (n.type === "request" && !resolvedLinkIds.has(n.linkId))
  ).length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-3 -m-1 rounded-lg hover:bg-slate-100 shrink-0"
        aria-label="Notifications"
      >
        <Bell size={20} className="text-slate-600 " />
        {pendingCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] max-h-96 overflow-y-auto bg-white rounded-xl shadow-lg border border-slate-200 z-30">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
          </div>

          {actionError && (
            <p className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{actionError}</p>
          )}

          {isLoading ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">Loading...</p>
          ) : notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  isActionable={n.type === "request" && !resolvedLinkIds.has(n.linkId)}
                  busy={busyLinkId === n.linkId}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TYPE_META = {
  request: { icon: Stethoscope, tone: "text-blue-600 bg-blue-50" },
  "request-sent": { icon: Stethoscope, tone: "text-blue-600 bg-blue-50" },
  accepted: { icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
  "patient-accepted": { icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
  declined: { icon: XCircle, tone: "text-slate-500 bg-slate-100" },
  "patient-declined": { icon: XCircle, tone: "text-slate-500 bg-slate-100" },
};

function notificationText(n) {
  switch (n.type) {
    // Patient-side wording — n.doctorName is the doctor who acted.
    case "request":
      return `Dr. ${n.doctorName} requested access to your records`;
    case "accepted":
      return `You accepted Dr. ${n.doctorName}'s request`;
    case "declined":
      return `You declined Dr. ${n.doctorName}'s request`;
    // Doctor-side wording — n.patientName is the patient involved.
    case "request-sent":
      return `You requested access to ${n.patientName}'s records`;
    case "patient-accepted":
      return `${n.patientName} accepted your request`;
    case "patient-declined":
      return `${n.patientName} declined your request`;
    default:
      return "Update";
  }
}

function NotificationRow({ notification, isActionable, busy, onAccept, onDecline }) {
  const meta = TYPE_META[notification.type] || TYPE_META.request;
  const Icon = meta.icon;

  return (
    <li className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50">
      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.tone}`}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-700">{notificationText(notification)}</p>
        <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(notification.at)}</p>

        {isActionable && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={(event) => onAccept(event, notification.linkId)}
              className="flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check size={12} />
              Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(event) => onDecline(event, notification.linkId)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={12} />
              Decline
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
