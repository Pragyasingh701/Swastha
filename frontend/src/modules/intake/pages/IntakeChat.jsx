import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { startIntake, sendIntakeTurn, finalizeIntake } from "../../../api/intake";
import Logo from "../../../components/Common/Logo";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import PatientIdBadge from "../../../components/Common/PatientIdBadge";
import PatientNotifications from "../../../components/Common/PatientNotifications";
import SettingsModal from "../../settings/components/SettingsModal";
import {
  LayoutGrid,
  TrendingUp,
  Folder,
  Users,
  Settings,
  UploadCloud,
  ClipboardList,
  Send,
  Loader2,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

// Same nav list as Dashboard.jsx / AISearch.jsx / Timeline.jsx / etc.
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
];

const MAX_MESSAGE_LENGTH = 500;

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
        {navItems.map(({ label, icon: Icon, route }) => {
          const isActive = Boolean(route && (pathname === route || pathname.startsWith(`${route}/`)));
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
          onClick={() => navigate("/timeline?upload=true")}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 text-white text-sm font-semibold py-2.5 rounded-lg"
        >
          <UploadCloud size={18} />
          Upload New Report
        </button>

        <div className="space-y-1 pt-2">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 "
          >
            <Settings size={18} />
            Settings
          </button>
        </div>
      </div>
    </aside>
  );
}

// Section labels shown in the progress strip — order matches the backend
// state machine (intakeService.js SECTIONS).
const SECTION_LABELS = {
  chief_complaint: "Main complaint",
  hpi: "About your symptoms",
  drug_allergy: "Medications & allergies",
  finalize: "Done",
};
const SECTION_ORDER = ["chief_complaint", "hpi", "drug_allergy", "finalize"];

function ChatBubble({ message }) {
  const isPatient = message.role === "patient";

  if (isPatient) {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-700 text-white text-sm rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        className={`text-sm rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%] ${
          message.isError
            ? "bg-red-50 text-red-700 border border-red-100 "
            : "bg-slate-50 text-slate-700 border border-slate-100 "
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}

export default function IntakeChat() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [sessionId, setSessionId] = useState(null);
  const [section, setSection] = useState("chief_complaint");
  const [messages, setMessages] = useState([]); // { role: 'patient'|'assistant', text, isError? }
  const [quickReplies, setQuickReplies] = useState([]);
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const scrollRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, quickReplies]);

  // Start the session exactly once — StrictMode/re-render safe via the ref.
  useEffect(() => {
    if (!isAuthenticated || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const res = await startIntake();
        setSessionId(res.session_id);
        setSection(res.section);
        setMessages([{ role: "assistant", text: res.next_question }]);
        setQuickReplies(res.quick_reply_options || []);
      } catch (err) {
        setError(err.message || "Could not start your intake session. Please try again.");
      } finally {
        setStarting(false);
      }
    })();
  }, [isAuthenticated]);

  async function submitAnswer(rawText) {
    const trimmed = (rawText || "").trim();
    if (!trimmed || sending || !sessionId || done) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "patient", text: trimmed }]);
    setQuickReplies([]);
    setInput("");
    setSending(true);

    try {
      const res = await sendIntakeTurn(sessionId, trimmed);
      setSection(res.section);
      setMessages((prev) => [...prev, { role: "assistant", text: res.next_question }]);
      setQuickReplies(res.quick_reply_options || []);

      // The backend's own state machine reaching "finalize" with no more
      // questions is the signal to close out — not a guess on our side.
      if (res.section === "finalize") {
        await finalizeIntake(sessionId);
        setDone(true);
      }
      // red_flag intentionally has NO visible effect here — it only affects
      // the doctor's queue sort/badge (already built), never surfaced to
      // the patient mid-intake (confirmed with the user: avoid alarming
      // someone before a clinician has actually looked at it).
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, that didn't go through. Please try again.", isError: true },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitAnswer(input);
  }

  const currentStepIndex = SECTION_ORDER.indexOf(section);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 ">
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
          <PatientNotifications />
          <PatientIdBadge />
          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto px-10 py-8 flex flex-col max-w-3xl mx-auto w-full">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardList className="text-blue-600" size={24} />
              Visit Intake
            </h1>
            <p className="text-slate-500 mt-1">
              A few quick questions before the doctor sees you — answer in your own words or tap an option.
            </p>
          </div>

          {/* Progress strip — section labels, current one highlighted. */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {SECTION_ORDER.filter((s) => s !== "finalize").map((s, i) => (
              <span
                key={s}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
                  i < currentStepIndex
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : i === currentStepIndex
                    ? "bg-blue-100 text-blue-700 border-blue-200"
                    : "bg-slate-50 text-slate-400 border-slate-100"
                }`}
              >
                {SECTION_LABELS[s]}
              </span>
            ))}
          </div>

          {!isAuthenticated ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-slate-500 ">
              Please log in to start your visit intake.
            </div>
          ) : starting ? (
            <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center justify-center min-h-[320px]">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" />
                Starting your intake session...
              </div>
            </div>
          ) : (
            <>
              <div
                ref={scrollRef}
                className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4 overflow-y-auto min-h-[320px] max-h-[55vh]"
              >
                <div className="space-y-4">
                  {messages.map((m, i) => (
                    <ChatBubble key={i} message={m} />
                  ))}
                  {sending && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Loader2 size={16} className="animate-spin" />
                      Thinking...
                    </div>
                  )}
                  {done && (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm">
                      <CheckCircle2 size={16} />
                      That's everything the doctor needs — please have a seat, you'll be called shortly.
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                  {error}
                </div>
              )}

              {!done && (
                <>
                  {quickReplies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {quickReplies.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={sending}
                          onClick={() => submitAnswer(opt)}
                          className="text-sm px-4 py-2 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="flex items-center gap-3">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                      maxLength={MAX_MESSAGE_LENGTH}
                      placeholder="Type your answer..."
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 "
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={sending || !input.trim()}
                      className="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors"
                    >
                      <Send size={16} />
                      Send
                    </button>
                  </form>
                </>
              )}

              {done && (
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="self-start flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
                >
                  Back to Dashboard
                </button>
              )}

              <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-3">
                <ShieldCheck size={13} className="text-slate-400 shrink-0" />
                This only records what you tell us — it never diagnoses or gives medical advice.
              </p>
            </>
          )}
        </main>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
