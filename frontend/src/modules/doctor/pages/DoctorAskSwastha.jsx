import React, { useEffect, useMemo, useRef, useState } from "react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import { getDoctorPatients } from "../../../services/doctorPatients";
import { searchReportsConversational, clearConversation } from "../../../api/search";
import {
  Sparkles,
  Send,
  FileText,
  Loader2,
  ExternalLink,
  ChevronDown,
  User,
  RotateCcw,
  Search,
  ShieldCheck,
  Clock,
} from "lucide-react";
import NotificationBell from "../../../components/Common/NotificationBell";

const EXAMPLE_QUESTIONS = [
  "Has this patient had any drug allergies or reactions?",
  "What medicines are they currently prescribed?",
  "Summarize their most recent lab results.",
];

// Feature highlights shown in the empty state before a patient is picked —
// matches the reference design's three-column callouts.
const FEATURE_HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "100% Private & Secure",
    description: "Your data is safe and always protected.",
  },
  {
    icon: FileText,
    title: "Grounded Answers",
    description: "AI answers are based only on uploaded records.",
  },
  {
    icon: Clock,
    title: "Save Time",
    description: "Get quick insights and make better decisions.",
  },
];

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// One conversation thread per patient the doctor has open in this browser
// tab. Switching the dropdown swaps to (or starts) that patient's own
// session_id + message list — asking a follow-up never accidentally reuses
// another patient's context, since each patient gets its own session_id.
function newSessionId() {
  // crypto.randomUUID() output (hyphenated hex) satisfies the backend's
  // session_id pattern (letters/numbers/hyphen/underscore, 8-128 chars).
  return crypto.randomUUID();
}

export default function DoctorAskSwastha() {
  const [patients, setPatients] = useState([]);
  const [isFetchingPatients, setIsFetchingPatients] = useState(true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");

  // patientUserId -> { sessionId, messages }
  const [threads, setThreads] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsFetchingPatients(true);
      try {
        const linkedPatients = await getDoctorPatients();
        if (!cancelled) setPatients(linkedPatients);
      } catch {
        if (!cancelled) setPatients([]);
      } finally {
        if (!cancelled) setIsFetchingPatients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setIsPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const patientUserId = useMemo(() => {
    if (!selectedPatient) return null;
    return selectedPatient.patientUserId || selectedPatient.patientId || selectedPatient.id;
  }, [selectedPatient]);

  const thread = patientUserId ? threads[patientUserId] : null;
  const messages = thread?.messages || [];

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const name = (p.patient_name || p.name || "").toLowerCase();
      const email = (p.patient_email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [patients, patientSearch]);

  function selectPatient(patient) {
    setSelectedPatient(patient);
    setIsPickerOpen(false);
    setPatientSearch("");
    setError(null);
    const pid = patient.patientUserId || patient.patientId || patient.id;
    // First time asking about this patient in this tab: open a fresh
    // conversation thread for them, scoped by their own session_id.
    setThreads((prev) =>
      prev[pid] ? prev : { ...prev, [pid]: { sessionId: newSessionId(), messages: [] } }
    );
  }

  async function handleNewChat() {
    if (!patientUserId || !thread) return;
    try {
      await clearConversation(thread.sessionId, patientUserId);
    } catch {
      // Clearing server-side memory is best-effort — starting a new
      // session_id below already stops old context from being used even
      // if this call fails (e.g. network hiccup).
    }
    setThreads((prev) => ({ ...prev, [patientUserId]: { sessionId: newSessionId(), messages: [] } }));
    setError(null);
  }

  async function runSearch(trimmed) {
    if (!trimmed || loading || !patientUserId || !thread) return;

    setError(null);
    const sessionId = thread.sessionId;
    setThreads((prev) => ({
      ...prev,
      [patientUserId]: {
        ...prev[patientUserId],
        messages: [...prev[patientUserId].messages, { role: "user", text: trimmed }],
      },
    }));
    setQuery("");
    setLoading(true);

    try {
      const result = await searchReportsConversational(trimmed, sessionId, patientUserId);
      setThreads((prev) => ({
        ...prev,
        [patientUserId]: {
          ...prev[patientUserId],
          messages: [
            ...prev[patientUserId].messages,
            {
              role: "assistant",
              text: result.answer,
              structured: result.structured || null,
              sources: result.sources || [],
              noResultsFound: result.noResultsFound,
            },
          ],
        },
      }));
    } catch (err) {
      setError(err.message || "Search failed. Please try again.");
      setThreads((prev) => ({
        ...prev,
        [patientUserId]: {
          ...prev[patientUserId],
          messages: [
            ...prev[patientUserId].messages,
            {
              role: "assistant",
              text: "Something went wrong answering that. Please try again.",
              sources: [],
              isError: true,
            },
          ],
        },
      }));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(query.trim());
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white">
          <NotificationBell />
          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto px-10 py-8 flex flex-col max-w-4xl mx-auto w-full">
          {/* Gradient banner — title/subtitle, no illustration per request */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/60 px-6 py-6 mb-5">
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="text-blue-600" size={22} />
              Ask Swastha
            </h1>
          </div>

          {/* Patient picker card */}
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 mb-5">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1 relative" ref={pickerRef}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Select a patient
                </label>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen((v) => !v)}
                  disabled={isFetchingPatients}
                  className="w-full flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 hover:border-blue-300 transition-colors disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Search size={16} className="text-slate-400 shrink-0" />
                    <span className={`truncate ${selectedPatient ? "" : "text-slate-400"}`}>
                      {isFetchingPatients
                        ? "Loading patients..."
                        : selectedPatient
                        ? selectedPatient.patient_name || selectedPatient.name
                        : "Search or select a patient"}
                    </span>
                  </span>
                  <ChevronDown size={16} className="text-slate-400 shrink-0" />
                </button>

                {isPickerOpen && (
                  <div className="absolute z-10 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-slate-100">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          autoFocus
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          placeholder="Search by name or email..."
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                        />
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto">
                      {filteredPatients.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-slate-400">
                          {patients.length === 0
                            ? "No linked patients yet — add one from the Patients page."
                            : "No patients match your search."}
                        </p>
                      ) : (
                        filteredPatients.map((p) => {
                          const pid = p.patientUserId || p.patientId || p.id;
                          const isSelected = pid === patientUserId;
                          return (
                            <button
                              key={pid}
                              type="button"
                              onClick={() => selectPatient(p)}
                              className={`w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition-colors ${
                                isSelected ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <User size={14} className="shrink-0 text-slate-400" />
                              <span className="truncate">{p.patient_name || p.name}</span>
                              {p.patient_email && (
                                <span className="text-xs text-slate-400 truncate">· {p.patient_email}</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-2.5 bg-blue-50/80 border border-blue-100 rounded-xl px-3.5 py-3 text-xs text-blue-700 max-w-xs">
                  <Clock size={16} className="text-blue-500 shrink-0" />
                  <span>Answers are based only on the selected patient's uploaded records.</span>
                </div>

                {selectedPatient && (
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-700 px-3 py-3 rounded-xl hover:bg-blue-50 transition-colors shrink-0 whitespace-nowrap"
                    title="Clear this conversation and start fresh"
                  >
                    <RotateCcw size={14} />
                    New chat
                  </button>
                )}
              </div>
            </div>
          </div>

          {!selectedPatient ? (
            <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center justify-center text-center min-h-[320px]">
              <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                <User size={24} />
              </div>
              <p className="text-slate-900 font-semibold text-lg mb-1.5">Choose a patient to get started</p>
              <p className="text-slate-400 text-sm mb-8">
                Select a patient above to ask questions about their records.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl pt-6 border-t border-slate-100">
                {FEATURE_HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Icon size={18} />
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4 overflow-y-auto min-h-[320px] max-h-[60vh]">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                      <Sparkles size={22} />
                    </div>
                    <p className="text-slate-600 font-medium mb-1">
                      Ask anything about {selectedPatient.patient_name || selectedPatient.name}'s records
                    </p>
                    <p className="text-slate-400 text-sm mb-5">Try one of these:</p>
                    <div className="flex flex-col gap-2 w-full max-w-md">
                      {EXAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQuery(q)}
                          className="text-left text-sm px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((m, i) => (
                      <ChatBubble key={i} message={m} />
                    ))}
                    {loading && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Loader2 size={16} className="animate-spin" />
                        Searching {selectedPatient.patient_name || selectedPatient.name}'s records...
                      </div>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-center gap-3">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Ask about ${selectedPatient.patient_name || selectedPatient.name}'s records...`}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors"
                >
                  <Send size={16} />
                  Ask
                </button>
              </form>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ChatBubble({ message }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-700 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
          {message.text}
        </div>
      </div>
    );
  }

  const structured = message.structured;
  const hasKeyFacts = structured?.keyFacts && structured.keyFacts.length > 0;

  return (
    <div className="flex justify-start">
      <div
        className={`text-sm rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] ${
          message.isError
            ? "bg-red-50 text-red-700 border border-red-100"
            : "bg-slate-50 text-slate-700 border border-slate-100"
        }`}
      >
        <p className="whitespace-pre-wrap font-medium text-slate-800">
          {structured?.headline || message.text}
        </p>

        {hasKeyFacts && (
          <ul className="mt-3 space-y-2">
            {structured.keyFacts.map((fact, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <span>
                  {fact.label && (
                    <span className="font-semibold text-slate-800">{fact.label}: </span>
                  )}
                  <span className="text-slate-600">{fact.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {structured?.caveat && (
          <p className="mt-3 text-xs text-slate-400 italic">{structured.caveat}</p>
        )}

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Sources</p>
            {message.sources.map((s) => (
              <SourceRow key={s.report_id} source={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceRow({ source }) {
  const content = (
    <>
      <FileText size={13} className="shrink-0 text-slate-400" />
      <span className="font-medium text-slate-600 truncate">{source.title || "Untitled report"}</span>
      {source.category && <span className="text-slate-400 shrink-0">· {source.category}</span>}
      {formatDate(source.report_date) && (
        <span className="text-slate-400 shrink-0">· {formatDate(source.report_date)}</span>
      )}
    </>
  );

  if (!source.file_url) {
    return <div className="flex items-center gap-2 text-xs text-slate-500 px-2 py-1.5">{content}</div>;
  }

  return (
    <a
      href={source.file_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-xs text-slate-500 px-2 py-1.5 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
    >
      {content}
      <span className="ml-auto flex items-center gap-1 text-blue-600 font-medium shrink-0">
        View
        <ExternalLink size={12} />
      </span>
    </a>
  );
}