import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { startIntake, sendIntakeTurn, finalizeIntake, transcribeIntakeAudio, replayIntakeAudio } from "../../../api/intake";
import { verifyClinicCode, sendClinicOtp, verifyClinicOtp } from "../../../api/clinic";
import Logo from "../../../components/Common/Logo";
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
  Mic,
  Square,
  Volume2,
  VolumeX,
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

function ChatBubble({ message, onReplay, isSpeaking, isLoading }) {
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

  // Every question gets its own replay control, not just the latest one —
  // a patient who missed an earlier question can hear that exact question
  // again without affecting where the conversation currently is. Omitted
  // for error bubbles, which have no spoken counterpart.
  const canReplay = typeof onReplay === "function" && !message.isError && !!message.text;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div
          className={`text-sm rounded-2xl rounded-bl-sm px-4 py-3 ${
            message.isError
              ? "bg-red-50 text-red-700 border border-red-100 "
              : "bg-slate-50 text-slate-700 border border-slate-100 "
          }`}
        >
          {message.text}
        </div>

        {canReplay && (
          <button
            type="button"
            onClick={() => onReplay(message.text)}
            disabled={isLoading}
            title={isSpeaking ? "Stop" : "Listen again"}
            aria-label={isSpeaking ? "Stop this question" : "Listen to this question again"}
            className={`mt-1.5 ml-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
              isSpeaking
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            {isLoading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Volume2 size={13} className={isSpeaking ? "animate-pulse" : ""} />
            )}
            {isSpeaking ? "Playing" : "Listen"}
          </button>
        )}
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
const GATE_STEPS = { CODE: "code", CONFIRM: "confirm", OTP: "otp", LANGUAGE: "language", CHAT: "chat" };

// Voice layer (PRD §6): language is resolved ONCE here, never per-turn.
// Both labels are written in their own script so a patient who can't read
// the other one can still pick correctly.
const LANGUAGE_OPTIONS = [
  { code: "hi-IN", label: "हिंदी", sublabel: "Hindi" },
  { code: "en-IN", label: "English", sublabel: "अंग्रेज़ी" },
];

// Pre-selected from browser locale, one-tap override (PRD §6). Anything
// that isn't clearly English falls to Hindi: this is an Indian government
// OPD context, so Hindi is the safer default when the locale is ambiguous.
function detectPreferredLanguage() {
  try {
    const locale = (navigator?.language || "").toLowerCase();
    if (locale.startsWith("en")) return "en-IN";
    return "hi-IN";
  } catch {
    return "hi-IN";
  }
}

// Mute is remembered across turns and across a page refresh, so a patient
// who silenced the voice once doesn't have to re-mute on every question.
const MUTE_STORAGE_KEY = "swastha_intake_muted";

function readStoredMute() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

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
  // Holds the currently-playing question audio so a new question can stop
  // the previous one rather than overlapping with it.
  const audioRef = useRef(null);
  // Pending timeout for the options readout that follows a question.
  const optionsTimerRef = useRef(null);

  // ── Voice layer state (Phase 7a/7b) ─────────────────────────────────
  // Chosen once on the language screen, then sent to /intake/start and
  // stored on the session row. Never re-derived per turn (PRD §6).
  const [language, setLanguage] = useState(detectPreferredLanguage);
  const [muted, setMuted] = useState(readStoredMute);
  // Audio for every question asked this session, keyed by the question
  // text, so ANY earlier question in the transcript can be replayed — not
  // just the latest one. Populated for free from each turn's own
  // audio_base64; anything missing (e.g. after a page refresh) is fetched
  // on demand from /intake/replay-audio.
  const [audioByText, setAudioByText] = useState({}); // { [text]: { base64, mime } }
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Which question bubble is currently playing or loading, so only that
  // bubble's icon shows the active state.
  const [speakingText, setSpeakingText] = useState(null);
  const [loadingAudioText, setLoadingAudioText] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

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
        const res = await startIntake(language);
        setSessionId(res.session_id);
        setSection(res.section);
        setMessages([{ role: "assistant", text: res.next_question }]);
        setQuickReplies(normalizeQuickReplies(res.quick_reply_options));
        playQuestionAudio(res);
      } catch (err) {
        setError(err.message || "Could not start your intake session. Please try again.");
      } finally {
        setStarting(false);
      }
    })();
    // `language` is intentionally not a dependency: it is fixed on the
    // language screen strictly before this step is reachable, and
    // startedRef makes this effect run exactly once regardless. Adding it
    // could only re-fire a start for an already-started session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, gateStep]);

  // Plays a base64 audio payload. Fire-and-forget by design: a blocked or
  // failed play must never interrupt the text flow, which stays fully
  // usable on its own (PRD §3). Autoplay is reliable here because the
  // patient has always tapped something first (the language button, at
  // minimum), which is what browsers require to unlock audio — but iOS
  // Safari can still refuse, so a rejection just leaves the speaker icon
  // sitting there for them to tap.
  function stopPlayback() {
    audioRef.current?.pause();
    audioRef.current = null;
    // Cancel a pending options clip too, or it would start playing after
    // the patient has already muted/stopped or moved to the next turn.
    if (optionsTimerRef.current) {
      clearTimeout(optionsTimerRef.current);
      optionsTimerRef.current = null;
    }
    setIsSpeaking(false);
    setSpeakingText(null);
  }

  // `followUp` is an optional second clip played after a short pause — used
  // for the quick-reply options readout, so a patient who is listening
  // rather than reading hears what they can choose from. Kept as a
  // separate clip rather than one combined recording so the question's own
  // audio stays cacheable across sessions (see withAudio in routes/intake.js).
  function playAudioPayload(base64, mime, forText = null, followUp = null) {
    if (!base64) return;
    try {
      const audio = new Audio(`data:${mime || "audio/wav"};base64,${base64}`);
      audioRef.current?.pause();
      audioRef.current = audio;
      audio.onplay = () => {
        setIsSpeaking(true);
        setSpeakingText(forText);
      };
      audio.onerror = stopPlayback;
      audio.onended = () => {
        if (!followUp?.base64) {
          stopPlayback();
          return;
        }
        // Beat of silence between question and options so they don't run
        // together as one breathless sentence.
        optionsTimerRef.current = setTimeout(() => {
          const opts = new Audio(`data:${followUp.mime || "audio/wav"};base64,${followUp.base64}`);
          audioRef.current = opts;
          opts.onended = stopPlayback;
          opts.onerror = stopPlayback;
          opts.play().catch(stopPlayback);
        }, 600);
      };
      audio.play().catch(stopPlayback);
    } catch {
      stopPlayback();
    }
  }

  // Called when a turn arrives. Caches the audio against its question text
  // so it can be replayed later, and autoplays it unless muted.
  function playQuestionAudio(res) {
    if (!res?.audio_base64 || !res.next_question) return;
    const payload = {
      base64: res.audio_base64,
      mime: res.audio_mime_type || "audio/wav",
      // Present only when this turn actually had quick_reply_options; a
      // free-text question carries none and gets no readout.
      options: res.options_audio_base64
        ? { base64: res.options_audio_base64, mime: res.options_audio_mime_type || "audio/wav" }
        : null,
    };
    setAudioByText((prev) => ({ ...prev, [res.next_question]: payload }));
    if (!muted) playAudioPayload(payload.base64, payload.mime, res.next_question, payload.options);
  }

  /**
   * Per-question replay (PRD §6 — "tap to replay anytime"). Works on ANY
   * question in the transcript, not just the latest, and is independent of
   * the mute toggle: mute governs autoplay of new questions, while this is
   * an explicit request to hear one, so it plays even when muted.
   *
   * Read-only — it never advances or alters the conversation.
   */
  async function handleReplayQuestion(text) {
    if (!text) return;

    // Tapping the bubble that's already playing stops it.
    if (speakingText === text) {
      stopPlayback();
      return;
    }

    const cached = audioByText[text];
    if (cached) {
      playAudioPayload(cached.base64, cached.mime, text, cached.options);
      return;
    }

    // Not cached (e.g. the page was refreshed mid-session) — ask the
    // backend to re-speak it. ttsService caches by text+language, so this
    // is usually a cache hit there too.
    if (!sessionId) return;
    setLoadingAudioText(text);
    try {
      const res = await replayIntakeAudio(sessionId, text);
      const payload = { base64: res.audio_base64, mime: res.audio_mime_type || "audio/wav" };
      setAudioByText((prev) => ({ ...prev, [text]: payload }));
      playAudioPayload(payload.base64, payload.mime, text);
    } catch {
      // Audio unavailable — the question text is still on screen to read.
      setVoiceNote("Could not play that question. Please read it above.");
    } finally {
      setLoadingAudioText(null);
    }
  }

  function handleToggleMute() {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable (private mode) — mute still works for this session */
      }
      // Muting mid-sentence should stop the current playback too, not just
      // suppress the next question.
      if (next) stopPlayback();
      return next;
    });
  }

  // ── Recording (PRD §8.1: tap to record, tap to stop, single blob) ────
  // The transcript lands in the SAME text field a typed answer uses, so
  // the patient reviews and edits before sending. There is deliberately no
  // separate confirmation dialog — the editable field is that step.
  async function startRecording() {
    setVoiceNote("");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = handleRecordingStopped;
      recorder.start();
      setIsRecording(true);

      // Speaking over the question is natural; keep the mic from picking
      // up our own TTS.
      stopPlayback();
    } catch {
      // Permission denied, no mic, or an insecure origin. Text input is
      // untouched and remains the way to answer.
      setVoiceNote("Microphone unavailable — please type your answer instead.");
      setIsRecording(false);
    }
  }

  function stopRecording() {
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setIsRecording(false);
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function handleRecordingStopped() {
    releaseMic();
    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    if (!chunks.length || !sessionId) return;

    const blob = new Blob(chunks, { type: chunks[0].type || "audio/webm" });
    setIsTranscribing(true);
    try {
      const { transcript } = await transcribeIntakeAudio(sessionId, blob);
      if (transcript) {
        // Append rather than replace: if the patient had already typed
        // something, silently destroying it would be worse than a slightly
        // odd join they can edit.
        setInput((prev) => {
          const merged = prev.trim() ? `${prev.trim()} ${transcript}` : transcript;
          return merged.slice(0, MAX_MESSAGE_LENGTH);
        });
        setVoiceNote("");
      }
    } catch (err) {
      // Never clears what the patient already typed.
      setVoiceNote(
        err.status === 422
          ? "Didn't catch that — try again or type your answer."
          : "Could not transcribe. Please type your answer."
      );
    } finally {
      setIsTranscribing(false);
    }
  }

  // Release the mic and stop audio if the patient navigates away mid-turn.
  useEffect(() => {
    return () => {
      releaseMic();
      audioRef.current?.pause();
      if (optionsTimerRef.current) clearTimeout(optionsTimerRef.current);
    };
  }, []);

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

    // OTP is verified as part of session creation, which now happens AFTER
    // the language screen — /api/clinic/verify-otp stores the chosen
    // language on the session row it creates, so the choice has to be made
    // before that call, not after. Hold the code and move to the language
    // step; handleLanguageChoice does the actual verify.
    setGateError("");
    setGateStep(GATE_STEPS.LANGUAGE);
  }

  // Creates the clinic-check-in session once the language is known. Split
  // out of handleClinicOtpSubmit so both entry paths (clinic check-in and
  // the plain remote flow) pick a language before any session row exists.
  async function startClinicSession(languageCode) {
    const otpCode = clinicOtp.join("");
    setGateLoading(true);
    setGateError("");
    try {
      const session = await verifyClinicOtp({
        doctorId: clinicDoctor.doctorId,
        otpCode,
        language: languageCode,
      });
      // Same shape POST /api/intake/start returns — feed it straight into
      // the chat state below instead of the remote-start effect.
      startedRef.current = true;
      setSessionId(session.session_id);
      setSection(session.section);
      setMessages([{ role: "assistant", text: session.next_question }]);
      setQuickReplies(normalizeQuickReplies(session.quick_reply_options));
      setStarting(false);
      setGateStep(GATE_STEPS.CHAT);
      playQuestionAudio(session);
    } catch (err) {
      // Send them back to the OTP screen — the code may have expired while
      // they were choosing, and retyping it is the recovery.
      setGateStep(GATE_STEPS.OTP);
      setGateError(err.message || "Invalid OTP code. Please try again.");
    } finally {
      setGateLoading(false);
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
    // Language is chosen before the session starts, since /intake/start
    // stores it on the session row (PRD §6).
    setGateStep(GATE_STEPS.LANGUAGE);
  }

  // Language screen -> chat. The tap that picks a language also serves as
  // the browser's required user-interaction gesture, which is what lets
  // the first question autoplay.
  //
  // Both entry paths land here before any session row exists, so the
  // choice is always honoured:
  //   - clinic check-in: verify the OTP now, passing the language into the
  //     session /api/clinic/verify-otp creates.
  //   - plain remote flow: just enter chat; the start effect calls
  //     /intake/start with this language.
  function handleLanguageChoice(code) {
    setLanguage(code);
    setGateError("");

    if (clinicDoctor) {
      startClinicSession(code);
      return;
    }
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

    try {
      const res = await sendIntakeTurn(sessionId, trimmed);
      setSection(res.section);
      setMessages((prev) => [...prev, { role: "assistant", text: res.next_question }]);
      setQuickReplies(normalizeQuickReplies(res.quick_reply_options));
      playQuestionAudio(res);

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
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    submitAnswer(input);
  }

  // Multi-select: tapping an option toggles it in/out of the running
  // selection instead of submitting immediately (single-select options
  // still submit on tap, unchanged behavior). "Send" below submits the
  // comma-joined selection as one patient message, same free-text channel
  // the backend already parses answers from — no new wire format needed.
  function toggleOption(opt) {
    setSelectedOptions((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  }

  function submitSelectedOptions() {
    if (selectedOptions.length === 0) return;
    submitAnswer(selectedOptions.join(", "));
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
                        {gateLoading ? "Verifying..." : "Continue"}
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

                {/* Language selector (PRD §6) — asked once, before the
                    session is created, since /intake/start stores the
                    choice on the session row. Pre-selected from browser
                    locale with a one-tap override; both options are
                    labelled in their own script so a patient who can't
                    read the other one can still choose correctly. */}
                {gateStep === GATE_STEPS.LANGUAGE && (
                  <>
                    <div className="text-center mb-8">
                      <div className="w-14 h-14 mx-auto mb-4 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center">
                        <Volume2 size={28} />
                      </div>
                      <h2 className="text-xl font-bold text-slate-900">Choose your language</h2>
                      <p className="mt-2 text-sm text-slate-500">अपनी भाषा चुनें</p>
                    </div>

                    {gateError && (
                      <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">{gateError}</div>
                    )}

                    <div className="space-y-3">
                      {LANGUAGE_OPTIONS.map((opt) => {
                        const isSuggested = opt.code === language;
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() => handleLanguageChoice(opt.code)}
                            disabled={gateLoading}
                            className={`w-full h-16 flex items-center justify-between px-5 rounded-xl border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              isSuggested
                                ? "border-blue-500 bg-blue-50 hover:bg-blue-100"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex flex-col items-start">
                              <span className="text-lg font-bold text-slate-900">{opt.label}</span>
                              <span className="text-xs text-slate-500">{opt.sublabel}</span>
                            </span>
                            {gateLoading ? (
                              <Loader2 size={20} className="animate-spin text-slate-400" />
                            ) : (
                              <ArrowRight size={20} className={isSuggested ? "text-blue-600" : "text-slate-400"} />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-6 text-center text-xs text-slate-400">
                      Questions will be read aloud in this language.
                      <br />
                      You can still type your answers at any time.
                    </p>
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
                    <ChatBubble
                      key={i}
                      message={m}
                      onReplay={handleReplayQuestion}
                      isSpeaking={speakingText === m.text}
                      isLoading={loadingAudioText === m.text}
                    />
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
                  {quickReplies.options.length > 0 && (
                    <div className="mb-3">
                      {quickReplies.allowMultiple ? (
                        // Multi-select — PRD §5: rendered as checkboxes when
                        // allow_multiple is true. Selection accumulates until
                        // "Send selected" submits it as one turn.
                        <>
                          <div className="flex flex-wrap gap-2 mb-2">
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
                          <button
                            type="button"
                            disabled={sending || selectedOptions.length === 0}
                            onClick={submitSelectedOptions}
                            className="text-sm px-4 py-2 rounded-full bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
                          >
                            Send selected
                          </button>
                        </>
                      ) : (
                        // Single-select — rendered as radio-style tap targets;
                        // tapping submits immediately, same UX as before this
                        // feature (PRD §5: radio buttons when allow_multiple
                        // is false).
                        <div className="flex flex-wrap gap-2" role="radiogroup">
                          {quickReplies.options.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              role="radio"
                              aria-checked="false"
                              disabled={sending}
                              onClick={() => submitAnswer(opt)}
                              className="text-sm px-4 py-2 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Voice controls + answer field. Everything is present
                      at once (PRD §6): listen, type, and speak are never
                      behind a "voice user vs text user" branch — someone
                      who types fluently can still listen, and someone who
                      spoke last turn can still type this one. */}
                  {voiceNote && (
                    <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {voiceNote}
                    </p>
                  )}

                  <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    {/* ONE speaker control: a mute toggle for autoplay of
                        new questions, with the icon reflecting the current
                        state. Replaying a specific question is a separate
                        affordance — the small speaker under each question
                        bubble in the transcript — so this button does not
                        double as a replay control. Muting persists across
                        turns and refreshes. */}
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      title={muted ? "Unmute — read questions aloud" : "Mute — stop reading questions aloud"}
                      aria-label={muted ? "Unmute question audio" : "Mute question audio"}
                      aria-pressed={muted}
                      className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border transition-colors ${
                        muted
                          ? "border-slate-300 bg-slate-100 text-slate-500"
                          : isSpeaking
                            ? "border-blue-300 bg-blue-100 text-blue-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {muted ? (
                        <VolumeX size={18} />
                      ) : (
                        <Volume2 size={18} className={isSpeaking ? "animate-pulse" : ""} />
                      )}
                    </button>

                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                      maxLength={MAX_MESSAGE_LENGTH}
                      placeholder={isRecording ? "Listening..." : isTranscribing ? "Transcribing..." : "Type your answer..."}
                      className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                      disabled={sending}
                    />

                    {/* Mic: tap to record, tap to stop. Does NOT submit —
                        the transcript lands in the field above so the
                        patient can correct it first (PRD §8.1). */}
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={sending || isTranscribing}
                      title={isRecording ? "Stop recording" : "Answer by voice"}
                      aria-label={isRecording ? "Stop recording" : "Record your answer"}
                      aria-pressed={isRecording}
                      className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        isRecording
                          ? "border-red-300 bg-red-100 text-red-600 animate-pulse"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {isTranscribing ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : isRecording ? (
                        <Square size={16} />
                      ) : (
                        <Mic size={18} />
                      )}
                    </button>

                    <button
                      type="submit"
                      disabled={sending || isRecording || !input.trim()}
                      className="shrink-0 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 rounded-xl transition-colors"
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
