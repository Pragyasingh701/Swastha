import React, { useEffect, useState } from "react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import NotificationBell from "../../../components/Common/NotificationBell";
import { AlertTriangle, ClipboardList, X, Loader2, Pill, ShieldAlert } from "lucide-react";
import { getIntakeQueue, getIntakeSessionDetail } from "../../../services/doctorPatients";

// Module A (Conversational History Engine) — DOCTOR-facing priority queue,
// its own page/sidebar entry (moved out of DoctorDashboard.jsx per request).
// Sessions already arrive sorted priority desc / created_at asc from the
// server (GET /api/doctor-patients/intake-queue) — not re-sorted here.
// Clicking a row opens the structured summary (structured_history) for
// that session via GET /api/doctor-patients/intake-queue/:sessionId.

// SOCRATES field order + labels — matches backend/rag/services/
// intakeService.js's HPI_FIELDS, kept in the same order for the doctor's
// reading flow (Site -> Onset -> Character -> Radiation -> Associated
// symptoms -> Timing -> Exacerbating/relieving -> Severity).
const HPI_FIELD_LABELS = [
  ["site", "Site"],
  ["onset", "Onset"],
  ["character", "Character"],
  ["radiation", "Radiation"],
  ["associated_symptoms", "Associated Symptoms"],
  ["timing", "Timing"],
  ["exacerbating_relieving", "Exacerbating / Relieving"],
  ["severity", "Severity"],
];

function formatIntakeTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatFieldValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "None reported";
  }
  if (value === null || value === undefined || value === "") {
    return "Not captured";
  }
  return String(value);
}

function TopBar() {
  return (
    <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white shadow-sm">
      <NotificationBell />
      <ProfileDropdown />
    </header>
  );
}

function PageHeader({ count, isLoading }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <ClipboardList className="text-blue-600" size={26} />
          Intake Queue
        </h2>
        <p className="text-slate-500">
          Patient visit intakes from your linked patients — flagged sessions sort to the top. Click a patient to see their structured summary.
        </p>
      </div>
      {!isLoading && (
        <span className="text-sm text-slate-400">
          {count} session{count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function IntakeQueueList({ sessions, isLoading, error, onSelect }) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {isLoading ? (
        <div className="px-5 py-6 text-sm text-slate-400">Loading intake sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-400">
          No patient intake sessions yet. Sessions appear here once a linked patient completes "Start Visit Intake".
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <li key={s.session_id}>
              <button
                type="button"
                onClick={() => onSelect(s.session_id)}
                className={`w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 ${
                  s.priority === "flagged" ? "bg-red-50/40 hover:bg-red-50/70" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {s.priority === "flagged" && (
                    <span className="shrink-0 w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                      <AlertTriangle size={17} />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {s.patient_name}
                      {s.priority === "flagged" && (
                        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 align-middle">
                          Flagged{s.red_flag_reason ? `: ${s.red_flag_reason}` : ""}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 truncate">
                      {s.chief_complaint || "No chief complaint recorded yet"}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${
                      s.status === "completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {s.status === "completed" ? "Completed" : "In progress"}
                  </span>
                  <p className="text-xs text-slate-400 mt-1">{formatIntakeTimestamp(s.created_at)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------- Session detail modal --------------------------- */

function IntakeSessionModal({ sessionId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getIntakeSessionDetail(sessionId);
        if (!cancelled) setDetail(result);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load this intake session.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const hpi = detail?.structured_history?.hpi || {};
  const drugAllergy = detail?.structured_history?.drug_allergy || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white border border-slate-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-200 bg-slate-50 sticky top-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">
              Visit Intake Summary
            </p>
            <h3 className="text-xl font-bold text-slate-900">
              {isLoading ? "Loading…" : detail?.patient_name || "Patient"}
            </h3>
            {!isLoading && detail?.chief_complaint && (
              <p className="text-sm text-slate-500 mt-1">Chief complaint: {detail.chief_complaint}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-slate-200 bg-white p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
              <Loader2 size={16} className="animate-spin" />
              Loading intake summary…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="space-y-5">
              {detail.priority === "flagged" && (
                <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <ShieldAlert size={18} className="text-red-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Red flag detected</p>
                    {detail.red_flag_reason && (
                      <p className="text-sm text-red-600">{detail.red_flag_reason}</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  History of Present Illness (SOCRATES)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {HPI_FIELD_LABELS.map(([key, label]) => (
                    <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">
                        {formatFieldValue(hpi[key])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Pill size={14} />
                  Medications & Allergies
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Current Medications</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">
                      {formatFieldValue(drugAllergy.current_medications)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Known Allergies</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">
                      {formatFieldValue(drugAllergy.allergies)}
                    </p>
                  </div>
                  {drugAllergy.notes && (
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:col-span-2">
                      <p className="text-xs text-slate-500">Notes</p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">{drugAllergy.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400 pt-1">
                This summary was gathered directly from the patient before their visit — it is not a diagnosis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IntakeQueue() {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getIntakeQueue();
        if (!cancelled) setSessions(result);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load intake queue.");
          setSessions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <PageHeader count={sessions.length} isLoading={isLoading} />
          <IntakeQueueList
            sessions={sessions}
            isLoading={isLoading}
            error={error}
            onSelect={setSelectedSessionId}
          />
        </main>
      </div>

      {selectedSessionId && (
        <IntakeSessionModal
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </div>
  );
}
