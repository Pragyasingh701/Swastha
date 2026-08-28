import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { startIntake, sendIntakeTurn, finalizeIntake } from "../../../api/intake";
import { verifyClinicCode, sendClinicOtp, verifyClinicOtp } from "../../../api/clinic";
import ResponsiveSidebar from "../../../components/Common/ResponsiveSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import PatientIdBadge from "../../../components/Common/PatientIdBadge";
import PatientNotifications from "../../../components/Common/PatientNotifications";
import SettingsModal from "../../settings/components/SettingsModal";
import OtpInput from "../../../components/Common/OtpInput";
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
  Building2,
  ArrowRight,
  AlertTriangle,
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
  return (
    <ResponsiveSidebar
      navItems={navItems}
      action={{ label: "Upload New Report", icon: UploadCloud, route: "/timeline?upload=true" }}
      onOpenSettings={onOpenSettings}
      className="bg-slate-50"
    />
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

// Normalizes a turn response's quick_reply_options into the { options,
// allow_multiple } shape — the backend now always sends this object shape
// (backend/rag/services/intakeService.js), but this stays defensive against
// a stale cached bundle or an older bare-array response reaching the UI.
function normalizeQuickReplies(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { options: Array.isArray(raw.options) ? raw.options : [], allowMultiple: !!raw.allow_multiple };
  }
  return { options: Array.isArray(raw) ? raw : [], allowMultiple: false };
}

// Gate steps shown before the chat itself. "code" is the entry screen
// (enter a clinic check-in code, or skip straight into a remote intake);
// "confirm"/"otp" mirror the old standalone ClinicCheckIn.jsx flow;
// "chat" reveals the actual conversation UI below.
const GATE_STEPS = { CODE: "code", CONFIRM: "confirm", OTP: "otp", CHAT: "chat" };

export default function IntakeChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Clinic Check-In flow can hand off an already-started session — created
  // by POST /api/clinic/verify-otp — instead of this page starting a fresh
  // remote one via POST /api/intake/start. Same shape either way:
  // { session_id, next_question, quick_reply_options, section, red_flag }.
  // preStarted only ever comes via router state now from within this same
  // page's own gate flow below (handleClinicOtpSubmit), kept as a prop-style
  // read so a future caller could still hand off a session the same way.
  const preStarted = location.state?.preStartedSession || null;

  // Gate: skip straight to "chat" when a session was already handed off;
  // otherwise start on the clinic-code entry screen every time /intake is
  // opened directly.
  const [gateStep, setGateStep] = useState(preStarted ? GATE_STEPS.CHAT : GATE_STEPS.CODE);
  const [clinicCode, setClinicCode] = useState("");
  const [clinicDoctor, setClinicDoctor] = useState(null); // { doctorId, doctorName, clinicName }
  const [clinicOtp, setClinicOtp] = useState(["", "", "", "", "", ""]);
  const [otpTimer, setOtpTimer] = useState(0);
  const [gateLoading, setGateLoading] = useState(false);
  // Same "still working on it" reassurance as sendingLongWait below, scoped
  // to the OTP-verify step specifically — that's the one gate request that
  // hits the AI dialogue ladder (it creates the intake session's first
  // turn), so it's the one that can legitimately run long. The code-verify
  // and doctor-confirm steps are plain DB lookups and stay fast, so this is
  // only ever rendered on the OTP submit button.
  const [gateLoadingLongWait, setGateLoadingLongWait] = useState(false);
  const [gateError, setGateError] = useState("");

  const [sessionId, setSessionId] = useState(preStarted?.session_id || null);
  const [section, setSection] = useState(preStarted?.section || "chief_complaint");
  const [messages, setMessages] = useState(
    preStarted ? [{ role: "assistant", text: preStarted.next_question }] : []
  ); // { role: 'patient'|'assistant', text, isError? }
  const [quickReplies, setQuickReplies] = useState(
    preStarted ? normalizeQuickReplies(preStarted.quick_reply_options) : { options: [], allowMultiple: false }
  );
  const [selectedOptions, setSelectedOptions] = useState([]); // multi-select in-progress picks
  const [input, setInput] = useState("");
  const [starting, setStarting] = useState(!preStarted);
  const [sending, setSending] = useState(false);
  // Flips true if a turn is still pending after a while — the AI provider
  // failover ladder (backend/rag/config/aiClient.js: multiple Gemini
  // keys/models, then an OpenRouter fallback) can legitimately take well
  // past what feels instant under provider slowness/rate-limiting, and a
  // static "Thinking..." with no change for that whole time reads as stuck/
  // frozen even though it isn't. This never changes any backend timing —
  // purely a "still working on it" reassurance once the wait crosses a
  // threshold a patient would otherwise worry about.
  const [sendingLongWait, setSendingLongWait] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  // Set once a turn's red_flag_is_new comes back true (backend: intakeService.js's
  // sticky red_flag, surfaced as a one-time signal) — shown as a persistent
  // banner, but deliberately does NOT block further chat input (confirmed
  // with the user: keep collecting the full history in parallel with
  // notifying staff, rather than a hard stop).
  const [priorityAlert, setPriorityAlert] = useState(false);

  const scrollRef = useRef(null);
  const startedRef = useRef(!!preStarted);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, quickReplies]);

  // Start a plain remote intake session exactly once the gate has resolved
  // to "chat" without a pre-started (clinic) session — StrictMode/re-render
  // safe via the ref.
  useEffect(() => {
    if (!isAuthenticated || gateStep !== GATE_STEPS.CHAT || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const res = await startIntake();
        setSessionId(res.session_id);
        setSection(res.section);
        setMessages([{ role: "assistant", text: res.next_question }]);
        setQuickReplies(normalizeQuickReplies(res.quick_reply_options));
      } catch (err) {
        setError(err.message || "Could not start your intake session. Please try again.");
      } finally {
        setStarting(false);
      }
    })();
  }, [isAuthenticated, gateStep]);

  async function handleClinicCodeSubmit(e) {
    e.preventDefault();
    const trimmed = clinicCode.trim().toUpperCase();
    if (!trimmed) return;

    setGateLoading(true);
    setGateError("");
    try {
      const result = await verifyClinicCode(trimmed);
      setClinicDoctor(result);
      setGateStep(GATE_STEPS.CONFIRM);
    } catch (err) {
      // Deliberately the same generic message the backend returns for every
      // failure mode — never guess at a more specific reason here.
      setGateError(err.message || "Invalid or expired code.");
    } finally {
      setGateLoading(false);
    }
  }

  function startClinicOtpCountdown() {
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function startClinicOtpStep() {
    setGateLoading(true);
    setGateError("");
    try {
      await sendClinicOtp();
      setGateStep(GATE_STEPS.OTP);
      setOtpTimer(60);
      startClinicOtpCountdown();
    } catch (err) {
      setGateError(err.message || "Failed to send verification code.");
    } finally {
      setGateLoading(false);
    }
  }

  async function handleClinicOtpSubmit(e) {
    e.preventDefault();
    const otpCode = clinicOtp.join("");
    if (otpCode.length !== 6) {
      setGateError("Please enter the complete 6-digit code.");
      return;
    }

    setGateLoading(true);
    setGateLoadingLongWait(false);
    setGateError("");
    const longWaitTimer = setTimeout(() => setGateLoadingLongWait(true), 8000);
    try {
      const session = await verifyClinicOtp({ doctorId: clinicDoctor.doctorId, otpCode });
      // Same shape POST /api/intake/start returns — feed it straight into
      // the chat state below instead of the remote-start effect.
      startedRef.current = true;
      setSessionId(session.session_id);
      setSection(session.section);
      setMessages([{ role: "assistant", text: session.next_question }]);
      setQuickReplies(normalizeQuickReplies(session.quick_reply_options));
      setStarting(false);
      setGateStep(GATE_STEPS.CHAT);
    } catch (err) {
      setGateError(err.message || "Invalid OTP code. Please try again.");
    } finally {
      clearTimeout(longWaitTimer);
      setGateLoading(false);
      setGateLoadingLongWait(false);
    }
  }

  async function handleClinicOtpResend() {
    setClinicOtp(["", "", "", "", "", ""]);
    setGateError("");
    try {
      await sendClinicOtp();
      setOtpTimer(60);
      startClinicOtpCountdown();
    } catch (err) {
      setGateError(err.message || "Failed to resend verification code.");
    }
  }

  function skipClinicCheckIn() {
    setGateError("");
    setGateStep(GATE_STEPS.CHAT);
  }

  async function submitAnswer(rawText) {
    const trimmed = (rawText || "").trim();
    if (!trimmed || sending || !sessionId || done) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "patient", text: trimmed }]);
    setQuickReplies({ options: [], allowMultiple: false });
    setSelectedOptions([]);
    setInput("");
    setSending(true);
    setSendingLongWait(false);
    // See sendingLongWait's declaration comment — this turn may sit in the
    // AI provider failover ladder for a while under slowness/rate-limiting;
    // if it's still pending past this threshold, swap the "Thinking..."
    // copy for a reassuring "still working" message instead of leaving a
    // static spinner running with no visible change.
    const longWaitTimer = setTimeout(() => setSendingLongWait(true), 8000);

    try {
      const res = await sendIntakeTurn(sessionId, trimmed);
      setSection(res.section);
      setMessages((prev) => [...prev, { role: "assistant", text: res.next_question }]);
      setQuickReplies(normalizeQuickReplies(res.quick_reply_options));

      // The backend's own state machine reaching "finalize" with no more
      // questions is the signal to close out — not a guess on our side.
      if (res.section === "finalize") {
        await finalizeIntake(sessionId);
        setDone(true);
      }
      // Priority Alert: shown once, the turn red_flag first flips true —
      // still also affects the doctor's queue sort/badge (unchanged).
      if (res.red_flag_is_new) {
        setPriorityAlert(true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, that didn't go through. Please try again.", isError: true },
      ]);
    } finally {
      clearTimeout(longWaitTimer);
      setSending(false);
      setSendingLongWait(false);
    }
  }

  // Combines whatever the patient selected as chips/checkboxes with
  // whatever they typed, rather than one silently overwriting the other.
  // Bug this fixes: a patient could check "Fever" AND type "tiredness" —
  // whichever button they used to submit only ever read its own piece of
  // state (the free-text form read only `input`, "Send selected" read only
  // `selectedOptions`), so the other one vanished with no error or
  // indication anything was dropped. This is now the ONLY place either
  // piece of state is read at submit time, from the ONE submit path (see
  // the Send button below) — there is no second handler left that can
  // forget about one or the other.
  //
  // `extraOption`, if given, is folded in too — used by the single-select
  // chip tap, which submits immediately on click rather than going through
  // the Send button, but can still have typed text sitting in the box that
  // needs to travel with it. Order (selections first, then free text) matches
  // how a patient would naturally read their own answer back.
  function combinedAnswer(extraOption) {
    const typed = input.trim();
    const parts = [...selectedOptions];
    if (extraOption) parts.push(extraOption);
    if (typed) parts.push(typed);
    return parts.join(", ");
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitAnswer(combinedAnswer());
  }

  // Multi-select: tapping an option toggles it in/out of the running
  // selection. Nothing submits from here — the single Send button (see
  // below) is the only submit path for multi-select, same as free text.
  function toggleOption(opt) {
    setSelectedOptions((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
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
              {gateStep === GATE_STEPS.CHAT
                ? "A few quick questions before the doctor sees you — answer in your own words or tap an option."
                : "If you're checking in at a clinic, enter the code shown at the front desk first."}
            </p>
          </div>

          {gateStep !== GATE_STEPS.CHAT ? (
            <div className="flex-1 flex items-start justify-center pt-6">
              <div className="w-full max-w-[440px] bg-white shadow-sm rounded-2xl p-8 border border-slate-100">
                {gateStep === GATE_STEPS.CODE && (
                  <>
                    <div className="text-center mb-8">
                      <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                        <Building2 size={28} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">Clinic Check-In</h2>
                      <p className="text-sm text-slate-500 mt-2">
                        Enter the check-in code displayed at your doctor's clinic, or skip if you're not at a clinic right now.
                      </p>
                    </div>

                    {gateError && (
                      <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{gateError}</div>
                    )}

                    <form onSubmit={handleClinicCodeSubmit} className="space-y-6">
                      <input
                        type="text"
                        autoFocus
                        value={clinicCode}
                        onChange={(e) => setClinicCode(e.target.value.toUpperCase().slice(0, 8))}
                        placeholder="e.g. 7K9M2P"
                        className="w-full h-14 text-center text-2xl font-bold tracking-[0.3em] uppercase bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 transition-all"
                      />
                      <button
                        type="submit"
                        disabled={gateLoading || !clinicCode.trim()}
                        className="w-full h-12 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                      >
                        {gateLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                        {gateLoading ? "Checking..." : "Continue"}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={skipClinicCheckIn}
                      disabled={gateLoading}
                      className="w-full mt-4 text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      Skip — I don't have a code
                    </button>
                  </>
                )}

                {gateStep === GATE_STEPS.CONFIRM && clinicDoctor && (
                  <>
                    <div className="text-center mb-8">
                      <div className="w-14 h-14 mx-auto mb-4 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                        <ShieldCheck size={28} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">Is this your doctor?</h2>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center mb-6">
                      <p className="text-lg font-semibold text-slate-900">{clinicDoctor.doctorName}</p>
                      {clinicDoctor.clinicName && (
                        <p className="text-sm text-slate-500 mt-1">{clinicDoctor.clinicName}</p>
                      )}
                    </div>

                    {gateError && (
                      <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{gateError}</div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setGateStep(GATE_STEPS.CODE);
                          setClinicDoctor(null);
                          setClinicCode("");
                        }}
                        className="flex-1 h-12 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
                      >
                        No, go back
                      </button>
                      <button
                        type="button"
                        onClick={startClinicOtpStep}
                        disabled={gateLoading}
                        className="flex-1 h-12 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
                      >
                        {gateLoading ? <Loader2 size={18} className="animate-spin" /> : "Yes, continue"}
                      </button>
                    </div>
                  </>
                )}

                {gateStep === GATE_STEPS.OTP && (
                  <>
                    <div className="text-center mb-8">
                      <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                        <ShieldCheck size={28} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">Verify it's you</h2>
                      <p className="text-sm text-slate-500 mt-2">
                        We've sent a 6-digit verification code to your account email.
                      </p>
                    </div>

                    {gateError && (
                      <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{gateError}</div>
                    )}

                    <form onSubmit={handleClinicOtpSubmit} className="space-y-8">
                      <OtpInput value={clinicOtp} onChange={setClinicOtp} disabled={gateLoading} />

                      <button
                        type="submit"
                        disabled={gateLoading}
                        className="w-full h-12 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
                      >
                        {gateLoading
                          ? gateLoadingLongWait
                            ? "Still setting up your session — hang tight..."
                            : "Verifying..."
                          : "Verify & Start Intake"}
                      </button>
                    </form>

                    <div className="mt-6 text-center">
                      {otpTimer > 0 ? (
                        <p className="text-sm text-slate-500">
                          Resend code in <span className="font-semibold text-blue-700">{otpTimer}s</span>
                        </p>
                      ) : (
                        <button
                          onClick={handleClinicOtpResend}
                          className="text-sm font-semibold text-blue-700 hover:underline"
                        >
                          Resend Verification Code
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
          {/* Priority Alert — shown once red_flag first fires (backend:
              intakeService.js red_flag_is_new), stays visible for the rest
              of the session but deliberately does not block the chat below
              (confirmed with the user: keep collecting history in parallel
              with notifying staff). */}
          {priorityAlert && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-red-800">
              <AlertTriangle size={20} className="shrink-0 mt-0.5 text-red-600" />
              <div className="text-sm">
                <p className="font-semibold">Priority Alert</p>
                <p className="mt-0.5 text-red-700">
                  Your response may require immediate medical attention. Please wait while our staff reviews your case — you can continue answering below in the meantime.
                </p>
              </div>
            </div>
          )}

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
                      {sendingLongWait
                        ? "Still working on it — this can take a bit longer than usual, hang tight..."
                        : "Thinking..."}
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
                  {quickReplies.options.length > 0 && (
                    <div className="mb-3">
                      {quickReplies.allowMultiple ? (
                        // Multi-select — PRD §5: rendered as checkboxes when
                        // allow_multiple is true. Checking only accumulates
                        // selection; nothing submits from here anymore — see
                        // the single Send button below for why the old
                        // separate "Send selected" button was removed.
                        <div className="flex flex-wrap gap-2">
                          {quickReplies.options.map((opt) => {
                            const checked = selectedOptions.includes(opt);
                            return (
                              <label
                                key={opt}
                                className={`flex items-center gap-2 text-sm px-4 py-2 rounded-full border cursor-pointer transition-colors ${
                                  checked
                                    ? "border-blue-400 bg-blue-100 text-blue-800"
                                    : "border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                                } ${sending ? "opacity-50 pointer-events-none" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  className="accent-blue-600"
                                  checked={checked}
                                  disabled={sending}
                                  onChange={() => toggleOption(opt)}
                                />
                                {opt}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        // Single-select — rendered as radio-style tap targets;
                        // tapping still submits immediately (unchanged), but
                        // now also folds in anything already typed via the
                        // same combinedAnswer() the main Send button uses, so
                        // a chip tap right after typing doesn't drop the
                        // typed part either.
                        <div className="flex flex-wrap gap-2" role="radiogroup">
                          {quickReplies.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              role="radio"
                              aria-checked="false"
                              disabled={sending}
                              onClick={() => submitAnswer(combinedAnswer(opt))}
                              className="text-sm px-4 py-2 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Single submit path. There used to be two — this form's
                      own submit, and a separate "Send selected" button next
                      to the checkboxes — and each read only its own piece of
                      state (typed text, or checked boxes) while ignoring the
                      other, silently dropping whichever one the patient
                      hadn't used to trigger that specific button. Collapsing
                      to one path removes that class of bug structurally:
                      there is no longer a second handler that CAN forget
                      about selectedOptions or input. Enabled whenever
                      there's a selection, typed text, or both —
                      combinedAnswer() merges them either way. */}
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
                      disabled={sending || (!input.trim() && selectedOptions.length === 0)}
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
            </>
          )}
        </main>
      </div>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
