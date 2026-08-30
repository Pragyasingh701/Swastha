import React, { useEffect, useState } from "react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import NotificationBell from "../../../components/Common/NotificationBell";
import {
  AlertTriangle,
  ClipboardList,
  X,
  Loader2,
  Pill,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  History,
  Leaf,
} from "lucide-react";
import {
  getIntakeQueue,
  getIntakeSessionDetail,
  completeIntakeSession,
  removeIntakeSession,
  getIntakeQueueHistory,
} from "../../../services/doctorPatients";

// Module A (Conversational History Engine) — DOCTOR-facing priority queue,
// its own page/sidebar entry (moved out of DoctorDashboard.jsx per request).
// Sessions already arrive sorted priority desc / created_at asc from the
// server (GET /api/doctor-patients/intake-queue) — not re-sorted here.
// Clicking a row opens the structured summary (structured_history) for
// that session via GET /api/doctor-patients/intake-queue/:sessionId.

// SOCRATES ordering + labels. NOT the list of what gets rendered — see the
// "Dynamic field rendering" note below. This only says how to word and
// order the fields we know about; anything captured that isn't listed here
// still renders, it just sorts after these and gets a humanized label.
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

// Mirrors backend/rag/services/intakeQuestions.js's AYURVEDA_SUBSECTIONS
// shape (group key -> title, field key -> label, in the same fixed order
// patients are asked) — this is what was previously entirely missing from
// the doctor's summary: ayurveda_profile was being collected on Ayurvedic
// sessions but the modal never rendered it, so only HPI + Medications &
// Allergies showed even though the patient answered a full Prakriti/
// Vikriti/etc. questionnaire (bug, confirmed with the user). Kept as a
// frontend-local mirror rather than importing the backend file directly
// (separate deployables) — field/group KEYS must stay in sync with that
// file if it ever changes, but labels here are free to differ slightly for
// display (e.g. "Body Frame" vs internal "body_frame").
const AYURVEDA_GROUPS = [
  {
    key: "prakriti",
    title: "Prakriti (Constitution)",
    fields: [
      ["body_frame", "Body Frame"],
      ["skin_type", "Skin Type"],
      ["appetite_pattern", "Appetite Pattern"],
      ["temperament", "Temperament"],
      ["sleep_tendency", "Sleep Tendency"],
    ],
  },
  {
    key: "agni_ahara",
    title: "Agni & Ahara (Digestion & Diet)",
    fields: [
      ["digestion_strength", "Digestion Strength"],
      ["bowel_pattern", "Bowel Pattern"],
      ["thirst_level", "Thirst Level"],
      ["taste_cravings", "Taste Cravings"],
      ["food_intolerances", "Food Intolerances"],
    ],
  },
  {
    key: "nidra_dinacharya",
    title: "Nidra & Dinacharya (Sleep & Routine)",
    fields: [
      ["sleep_hours", "Sleep Hours"],
      ["sleep_quality", "Sleep Quality"],
      ["wake_routine", "Wake Routine"],
      ["activity_level", "Activity Level"],
      ["work_stress_pattern", "Work / Stress Pattern"],
    ],
  },
  {
    key: "manas",
    title: "Manas (Mental-Emotional State)",
    fields: [
      ["current_mood", "Current Mood"],
      ["recent_stressors", "Recent Stressors"],
    ],
  },
  {
    // vikruti_qualities is flat at the top level of ayurveda_profile (not
    // nested under a "vikruti" object) — matches AYURVEDA_FIELD_GROUPS'
    // null-group convention in intakeQuestions.js.
    key: null,
    title: "Vikruti (Current Complaint Quality)",
    fields: [["vikruti_qualities", "Vikruti Qualities"]],
  },
  {
    key: "history_ayurvedic",
    title: "History (Prior Ayurvedic Treatment)",
    fields: [
      ["prior_treatments", "Prior Treatments"],
      ["home_remedies", "Home Remedies"],
    ],
  },
];

// Curated order + wording for drug_allergy, same role as HPI_FIELD_LABELS.
const DRUG_ALLERGY_FIELD_LABELS = [
  ["current_medications", "Current Medications"],
  ["allergies", "Known Allergies"],
  ["notes", "Notes"],
];

// ─────────────────────────────────────────────────────────────────────────
// Dynamic field rendering.
//
// The label tables above are ORDERING AND LABEL HINTS, not the list of what
// gets displayed. The modal used to iterate them directly, which meant the
// summary showed exactly the fields someone had remembered to list here —
// anything the intake captured but this file didn't know about was silently
// invisible to the doctor, with no error and nothing on screen to hint that
// an answer existed. That is a bad failure mode for a clinical summary: a
// doctor cannot tell the difference between "the patient wasn't asked" and
// "the answer exists but this screen drops it".
//
// So rendering now works the other way round: iterate what the SESSION
// actually contains, and use these tables only to decide order and wording.
// Known fields keep their curated label and position; unknown ones still
// appear (at the end, with a humanized label) rather than disappearing.
// ─────────────────────────────────────────────────────────────────────────

// Keys that are state-machine bookkeeping rather than patient answers, and
// so must never be rendered as if they were something the patient said.
const NON_ANSWER_KEYS = new Set(["section", "red_flag", "red_flag_reason"]);

// "work_stress_pattern" -> "Work Stress Pattern". Fallback only — a curated
// label from the tables above always wins when one exists.
function humanizeFieldKey(key) {
  return String(key)
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// True when a captured value is worth showing. Explicit false/0 count as
// answers; only null/undefined/""/[] mean "nothing was captured".
function hasAnswer(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

// Fields where an EMPTY array is itself a real, complete answer ("asked,
// patient said nothing else") — the backend's own convention for
// hpi.associated_symptoms (see intakeService.js's hpiComplete()/
// capturedFieldKeys(), which both accept Array.isArray(v) with no
// length check). hasAnswer() above intentionally treats [] as "nothing to
// show" for every OTHER field (a genuinely blank multi-select), so this
// field needs its own carve-out rather than changing hasAnswer() globally.
//
// Without this, the summary silently omitted Associated Symptoms whenever
// the patient's answer was "nothing else" — indistinguishable on screen
// from the question never having been asked at all, which is exactly the
// ambiguity the modal's dynamic-iteration rewrite was meant to eliminate
// (live repro: session ec90922d-2d6e-45c7-a771-cb6ba294def3 — asked and
// correctly answered "nothing else", card never appeared, jumped straight
// from Radiation to Timing).
const EMPTY_ARRAY_IS_AN_ANSWER = new Set(["associated_symptoms"]);

/**
 * Orders an object's answered fields for display: fields named in
 * `labelPairs` first, in that order, then any remaining answered fields the
 * table didn't know about.
 *
 * @param {object} obj    the captured section from structured_history
 * @param {Array}  labelPairs  [[key, label], ...] curated order + wording
 * @returns {Array<{key, label, value}>}
 */
function orderedAnsweredFields(obj, labelPairs) {
  if (!obj || typeof obj !== "object") return [];
  const labels = new Map(labelPairs);
  const out = [];
  const isAnswered = (key, value) =>
    hasAnswer(value) || (EMPTY_ARRAY_IS_AN_ANSWER.has(key) && Array.isArray(value));

  for (const [key, label] of labelPairs) {
    if (isAnswered(key, obj[key])) out.push({ key, label, value: obj[key] });
  }
  for (const key of Object.keys(obj)) {
    if (labels.has(key) || NON_ANSWER_KEYS.has(key)) continue;
    if (isAnswered(key, obj[key])) out.push({ key, label: humanizeFieldKey(key), value: obj[key] });
  }
  return out;
}

/**
 * Same idea for ayurveda_profile, which is grouped one level deeper.
 * Returns only groups that actually have answers, so an untouched
 * sub-section doesn't render as an empty heading.
 */
function orderedAyurvedaGroups(profile) {
  if (!profile || typeof profile !== "object") return [];
  const known = new Set();
  const groups = [];

  for (const { key, title, fields } of AYURVEDA_GROUPS) {
    // key === null means the fields live flat on the profile itself
    // (vikruti_qualities), matching AYURVEDA_FIELD_GROUPS' convention.
    const source = key ? profile[key] : profile;
    if (key) known.add(key);
    fields.forEach(([f]) => known.add(f));
    const items = orderedAnsweredFields(source, fields)
      // For the flat group, only take its own declared fields — otherwise it
      // would swallow every other top-level key on the profile.
      .filter((it) => (key ? true : fields.some(([f]) => f === it.key)));
    if (items.length > 0) groups.push({ title, items });
  }

  // Anything on the profile these groups don't cover — a new sub-section, or
  // a new field inside one — still gets shown rather than dropped.
  const extras = [];
  for (const [k, v] of Object.entries(profile)) {
    if (known.has(k) || NON_ANSWER_KEYS.has(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const items = orderedAnsweredFields(v, []);
      if (items.length > 0) groups.push({ title: humanizeFieldKey(k), items });
    } else if (hasAnswer(v)) {
      extras.push({ key: k, label: humanizeFieldKey(k), value: v });
    }
  }
  if (extras.length > 0) groups.push({ title: "Other", items: extras });

  return groups;
}

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

function PageHeader({ count, isLoading, view, onChangeView }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1 flex items-center gap-2">
          <ClipboardList className="text-blue-600" size={26} />
          Intake Queue
        </h2>
        <p className="text-slate-500">
          {view === "queue"
            ? "Patient visit intakes from your linked patients — flagged sessions sort to the top. Click a patient to see their structured summary."
            : "Sessions you've marked Completed or Removed from the active queue."}
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

function ViewTabs({ view, onChangeView }) {
  const tabs = [
    { key: "queue", label: "Active Queue", icon: ClipboardList },
    { key: "history", label: "History", icon: History },
  ];
  return (
    <div className="flex items-center gap-2 mb-6 border-b border-slate-200">
      {tabs.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChangeView(key)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            view === key
              ? "border-blue-600 text-blue-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>
  );
}

// Renders one group's rows. Split out of IntakeQueueList so the "In
// Progress" and "Ready for Review" sections (see IntakeQueueList below)
// share identical row markup instead of two copies drifting apart.
function IntakeQueueRows({ sessions, onSelect, onComplete, onRemove, actioningId }) {
  return (
    <ul className="divide-y divide-slate-100">
      {sessions.map((s) => {
        const isActioning = actioningId === s.session_id;
        return (
          <li key={s.session_id}>
                <div
                  className={`w-full flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50 ${
                    s.priority === "flagged" ? "bg-red-50/40 hover:bg-red-50/70" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(s.session_id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
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
                      <p className="text-sm text-slate-500 truncate flex items-center gap-2">
                        <span className="truncate">{s.chief_complaint || "No chief complaint recorded yet"}</span>
                        {/* Treatment-method badge — lets a doctor tell at a
                            glance which intake question set this patient
                            went through (Ayurvedic sessions include the
                            extra ayurveda_profile section). Doesn't affect
                            queue ordering — see getIntakeQueueForPatients'
                            doctorId-scoping comment for why every session
                            shown here already belongs to this doctor
                            (or is unclaimed) regardless of method. */}
                        <span
                          className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded ${
                            s.intake_method === "ayurvedic"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {s.intake_method === "ayurvedic" ? "Ayurvedic" : "Allopathic"}
                        </span>
                      </p>
                    </div>
                  </button>

                  <div className="shrink-0 flex items-center gap-3">
                    <div className="text-right">
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

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="Mark as completed"
                        disabled={isActioning}
                        onClick={(e) => {
                          e.stopPropagation();
                          onComplete(s.session_id);
                        }}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isActioning ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Complete
                      </button>
                      <button
                        type="button"
                        title="Remove from queue"
                        disabled={isActioning}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(s.session_id);
                        }}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isActioning ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
          </li>
        );
      })}
    </ul>
  );
}

// Active Queue is split into two groups rather than one flat list (Issue
// #1 — the queue used to filter to status === "completed" only, which hid
// every in_progress session, including flagged ones, from the doctor until
// the patient finished answering — defeating the whole point of the
// mid-session red-flag alert). Both groups come from the SAME
// doctor_action IS NULL result the backend already returns; this only
// regroups by status, it does not refetch or re-scope anything.
function IntakeQueueList({ sessions, isLoading, error, onSelect, onComplete, onRemove, actioningId }) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-6 text-sm text-slate-400">Loading intake sessions…</div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-6 text-sm text-slate-400">
          No patient intake sessions yet. A session reaches this queue once a patient you're linked to starts "Start Visit Intake" — a walk-in can link themselves by entering your daily check-in code at the start of their intake.
        </div>
      </div>
    );
  }

  const inProgress = sessions.filter((s) => s.status !== "completed");
  const readyForReview = sessions.filter((s) => s.status === "completed");
  const rowProps = { onSelect, onComplete, onRemove, actioningId };

  return (
    <div className="space-y-6">
      {inProgress.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
            In Progress
            <span className="text-xs font-medium text-slate-400">
              patient is still answering — flagged sessions need attention now
            </span>
          </h3>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <IntakeQueueRows sessions={inProgress} {...rowProps} />
          </div>
        </div>
      )}

      {readyForReview.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Ready for Review</h3>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <IntakeQueueRows sessions={readyForReview} {...rowProps} />
          </div>
        </div>
      )}
    </div>
  );
}

function IntakeHistoryList({ history, isLoading, error }) {
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
        <div className="px-5 py-6 text-sm text-slate-400">Loading history…</div>
      ) : history.length === 0 ? (
        <div className="px-5 py-6 text-sm text-slate-400">
          No completed or removed sessions yet. Actions you take from the Active Queue tab show up here.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {history.map((h) => (
            <li key={h.session_id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                    h.action === "completed" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {h.action === "completed" ? <CheckCircle2 size={17} /> : <Trash2 size={17} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{h.patient_name}</p>
                  <p className="text-sm text-slate-500 truncate flex items-center gap-2">
                    <span className="truncate">{h.chief_complaint || "No chief complaint recorded"}</span>
                    {/* Same treatment-method badge as the active queue and
                        the summary modal (Issue #9 — this was previously
                        the only place showing intake_method even though
                        the backend already returns it on every history
                        row, see getIntakeActionHistoryForDoctor). */}
                    <span
                      className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded ${
                        h.intake_method === "ayurvedic"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {h.intake_method === "ayurvedic" ? "Ayurvedic" : "Allopathic"}
                    </span>
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${
                    h.action === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {h.action === "completed" ? "Completed" : "Removed"}
                </span>
                <p className="text-xs text-slate-400 mt-1">{formatIntakeTimestamp(h.acted_at)}</p>
              </div>
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
  const ayurvedaProfile = detail?.structured_history?.ayurveda_profile || null;

  // Built from what the SESSION actually captured, with the tables above
  // supplying order and wording — see the "Dynamic field rendering" note.
  const hpiFields = orderedAnsweredFields(hpi, HPI_FIELD_LABELS);
  const drugAllergyFields = orderedAnsweredFields(drugAllergy, DRUG_ALLERGY_FIELD_LABELS);
  const ayurvedaGroups = orderedAyurvedaGroups(ayurvedaProfile);

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
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              {isLoading ? "Loading…" : detail?.patient_name || "Patient"}
              {!isLoading && detail && (
                <span
                  className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                    detail.intake_method === "ayurvedic" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {detail.intake_method === "ayurvedic" ? "Ayurvedic" : "Allopathic"}
                </span>
              )}
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
                {hpiFields.length === 0 && (
                  <p className="text-sm text-slate-400">
                    Not captured yet — the patient hasn't reached this part of the intake.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hpiFields.map(({ key, label, value }) => (
                    <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">
                        {formatFieldValue(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ayurveda constitutional/lifestyle profile — only present on
                      intake_method: "ayurvedic" sessions. Groups and fields are
                      ordered by AYURVEDA_GROUPS but sourced from the session, so
                      a sub-section the patient never reached is omitted rather
                      than shown empty, and a group this file doesn't know about
                      still appears. */}
              {ayurvedaGroups.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Leaf size={14} />
                    Ayurveda / Dashavidha Profile
                  </h4>
                  <div className="space-y-4">
                    {ayurvedaGroups.map(({ title, items }) => (
                      <div key={title}>
                        <p className="text-xs font-semibold text-slate-500 mb-1.5">{title}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {items.map(({ key, label, value }) => (
                            <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                              <p className="text-xs text-slate-500">{label}</p>
                              <p className="text-sm font-medium text-slate-900 mt-0.5">
                                {formatFieldValue(value)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Pill size={14} />
                  Medications & Allergies
                </h4>
                {drugAllergyFields.length === 0 && (
                  <p className="text-sm text-slate-400">
                    Not captured yet — the patient hasn't reached this part of the intake.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {drugAllergyFields.map(({ key, label, value }) => (
                    <div
                      key={key}
                      className={`rounded-xl border border-slate-100 bg-slate-50 p-3 ${
                        key === "notes" ? "sm:col-span-2" : ""
                      }`}
                    >
                      <p className="text-xs text-slate-500">{label}</p>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">
                        {formatFieldValue(value)}
                      </p>
                    </div>
                  ))}
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
  const [view, setView] = useState("queue"); // 'queue' | 'history'
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  async function loadQueue() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getIntakeQueue();
      // The backend already scopes this to doctor_action IS NULL (every
      // session still on this doctor's active queue, in_progress or
      // completed) — no further filtering here. It used to be filtered to
      // status === "completed" only, which hid every in_progress session
      // (including flagged ones) until the patient finished the whole
      // intake (Issue #1 — confirmed live: 78% of active-eligible sessions
      // were in_progress and invisible). IntakeQueueList now renders both
      // groups, so this just needs to pass everything through.
      setSessions(result);
    } catch (err) {
      setError(err.message || "Failed to load intake queue.");
      setSessions([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  // History is fetched lazily on first switch to that tab, not on mount —
  // most doctors will spend most of their time on the active queue.
  useEffect(() => {
    if (view !== "history" || historyLoaded) return;
    let cancelled = false;

    (async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const result = await getIntakeQueueHistory();
        if (!cancelled) {
          setHistory(result);
          setHistoryLoaded(true);
        }
      } catch (err) {
        if (!cancelled) setHistoryError(err.message || "Failed to load history.");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [view, historyLoaded]);

  async function handleAction(sessionId, action) {
    if (actioningId) return; // one action in flight at a time
    setActionError(null);
    setActioningId(sessionId);
    try {
      if (action === "completed") {
        await completeIntakeSession(sessionId);
      } else {
        await removeIntakeSession(sessionId);
      }
      // Drop it from the live queue immediately — the row already moved
      // server-side (doctor_action is set), no need to re-fetch the whole
      // list. Invalidate the cached history so the next visit to that tab
      // picks up this action rather than showing stale data.
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      setHistoryLoaded(false);
    } catch (err) {
      setActionError(err.message || `Failed to mark this session as ${action}.`);
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 flex">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <TopBar />

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8">
          <PageHeader
            count={view === "queue" ? sessions.length : history.length}
            isLoading={view === "queue" ? isLoading : historyLoading}
            view={view}
          />
          <ViewTabs view={view} onChangeView={setView} />

          {actionError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionError}
            </div>
          )}

          {view === "queue" ? (
            <IntakeQueueList
              sessions={sessions}
              isLoading={isLoading}
              error={error}
              onSelect={setSelectedSessionId}
              onComplete={(id) => handleAction(id, "completed")}
              onRemove={(id) => handleAction(id, "removed")}
              actioningId={actioningId}
            />
          ) : (
            <IntakeHistoryList history={history} isLoading={historyLoading} error={historyError} />
          )}
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
