import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { startIntake, resumeIntake, sendIntakeTurn, finalizeIntake, transcribeIntakeAudio, replayIntakeAudio } from "../../../api/intake";
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
  Mic,
  Square,
  Volume2,
  VolumeX,
  ShieldCheck,
  CheckCircle2,
  Building2,
  ArrowRight,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

// Same nav list as Dashboard.jsx / AISearch.jsx / Timeline.jsx / etc.
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
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
// (enter a clinic check-in code — mandatory, no skip path); "confirm"/"otp"
// mirror the old standalone ClinicCheckIn.jsx flow; "chat" reveals the
// actual conversation UI below.
const GATE_STEPS = { CODE: "code", CONFIRM: "confirm", OTP: "otp", LANGUAGE: "language", CHAT: "chat" };

// Voice layer (PRD §6): language is resolved ONCE here, never per-turn.
// Both labels are written in their own script so a patient who can't read
// the other one can still pick correctly.
const LANGUAGE_OPTIONS = [
  { code: "hi-IN", label: "हिंदी", sublabel: "Hindi" },
  { code: "en-IN", label: "English", sublabel: "अंग्रेज़ी" },
];

// Patient-facing chrome that is NOT model-generated, so it needs its own
// translations or it reverts to English in an otherwise-Hindi session —
// which is exactly what happened at the end of intake: every question was
// Hindi and then the completion banner and its button were English. The
// question text itself never needs an entry here; it arrives from the
// backend already written in the session's language.
const UI_TEXT = {
  "hi-IN": {
    backToDashboard: "डैशबोर्ड पर वापस जाएं",
    disclaimer: "इसमें केवल वही दर्ज होता है जो आप बताते हैं — यह कोई रोग नहीं बताता और न ही कोई चिकित्सकीय सलाह देता है।",
    thinking: "सोच रहे हैं...",
    stillWorking: "अभी भी काम चल रहा है — इसमें थोड़ा ज़्यादा समय लग सकता है, कृपया प्रतीक्षा करें...",
    typeAnswer: "अपना उत्तर लिखें...",
    listening: "सुन रहे हैं...",
    transcribing: "लिखा जा रहा है...",
  },
  "en-IN": {
    backToDashboard: "Back to Dashboard",
    disclaimer: "This only records what you tell us — it never diagnoses or gives medical advice.",
    thinking: "Thinking...",
    stillWorking: "Still working on it — this can take a bit longer than usual, hang tight...",
    typeAnswer: "Type your answer...",
    listening: "Listening...",
    transcribing: "Transcribing...",
  },
};

function uiText(language) {
  return UI_TEXT[language] || UI_TEXT["hi-IN"];
}

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

// ── Live (interim) transcription ────────────────────────────────────────
// The recorded answer is still uploaded to /intake/transcribe on stop, and
// Sarvam's result is still what gets used — it is the only path here that
// handles Hinglish, which is the stated reason the ASR phase exists
// (asrService.js's header). Sarvam's REST endpoint is single-blob with no
// partial/interim results, and WebSocket streaming against it was
// explicitly deferred as unproven on Render (asrService.js §8.1/§10), so
// live text cannot come from the existing backend path without a provider
// or transport change.
//
// What CAN provide it today, with no backend change and no extra API cost,
// is the browser's own SpeechRecognition — it emits interim results while
// the patient is still speaking, which is exactly the live-captioning UX
// asked for. So it runs ALONGSIDE the existing MediaRecorder purely as a
// live preview, and Sarvam's transcript overwrites that preview on stop.
//
// Deliberately a progressive enhancement, never a dependency: it is absent
// in Firefox and in several Android WebViews, and in Chrome it round-trips
// audio through Google's servers. If it is unavailable or errors, the
// recording flow is byte-for-byte what it was before — record, stop,
// upload, fill the field.
function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// Mute is remembered across turns and across a page refresh, so a patient
// who silenced the voice once doesn't have to re-mute on every question.

function readStoredMute() {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// Issue #4 fix (audit report): the active session_id, so a refresh/tab-close
// can be resumed instead of silently abandoning the session and starting a
// fresh one every time (a direct contributor to the stuck in_progress rows
// found live — Issue #10). Cleared once the session finalizes (see
// clearStoredSessionId in submitAnswer) or when a resume attempt turns out
// stale (the backend 404s — already finished, or genuinely gone).
const SESSION_STORAGE_KEY = "swastha_intake_session_id";

function readStoredSessionId() {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredSessionId(sessionId) {
  try {
    if (sessionId) localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    else localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode) — resume just won't work this session */
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

  // A session handed off from a previous page (rather than started fresh by
  // one of the effects below) still needs to be persisted for resume —
  // otherwise a refresh right after landing here with a preStarted session
  // would have nothing stored yet.
  useEffect(() => {
    if (preStarted?.session_id) writeStoredSessionId(preStarted.session_id);
    // Only ever runs off the value present at mount — preStarted itself
    // never changes for the lifetime of this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [otherPrompt, setOtherPrompt] = useState("");
  const [otherRequired, setOtherRequired] = useState(false);
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
  // Holds the currently-playing question audio so a new question can stop
  // the previous one rather than overlapping with it.
  const audioRef = useRef(null);
  // Pending timeout for the options readout that follows a question.
  const optionsTimerRef = useRef(null);
  // Monotonic token identifying the most recent playback request. Any async
  // work (a replay-audio fetch, the options-readout timer) checks that its
  // token is still current before it makes a sound, so a slow response that
  // resolves after the patient has already moved on is discarded instead of
  // playing over the question now on screen. Newest request always wins.
  const playTokenRef = useRef(0);

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
  // Live-preview recognizer (see getSpeechRecognition). Held in a ref
  // rather than state — it is an imperative object nothing renders off.
  const recognitionRef = useRef(null);
  // What the patient had already typed when recording started. The live
  // preview is rendered as `typedBeforeRecording + interim`, so each
  // interim update REPLACES the previous preview instead of appending to
  // it — without this, "I have" -> "I have a" -> "I have a fever" would
  // accumulate into "I haveI have aI have a fever".
  const typedBeforeRecordingRef = useRef("");
  // Interim text shown while speaking. Not the authoritative answer:
  // Sarvam's transcript replaces it on stop.
  const [liveTranscript, setLiveTranscript] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, quickReplies]);

  // Start a plain remote intake session exactly once the gate has resolved
  // to "chat" without a pre-started (clinic) session — StrictMode/re-render
  // safe via the ref.
  //
  // Issue #4 fix (audit report): before creating a brand-new session, try
  // resuming a previously-stored one first (see SESSION_STORAGE_KEY above)
  // — this is what makes a refresh/tab-close continue the same session
  // instead of always abandoning it. A resume attempt that fails for any
  // reason (nothing stored, the backend 404s because it's already finished
  // or genuinely gone, or a network error) falls straight through to the
  // normal start path — resuming is a best-effort convenience, never a hard
  // gate on being able to use intake at all.
  useEffect(() => {
    if (!isAuthenticated || gateStep !== GATE_STEPS.CHAT || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const storedSessionId = readStoredSessionId();
      if (storedSessionId) {
        try {
          const res = await resumeIntake(storedSessionId);
          setSessionId(res.session_id);
          setSection(res.section);
          setMessages(Array.isArray(res.messages) && res.messages.length > 0
            ? res.messages
            : [{ role: "assistant", text: res.next_question }]);
          setQuickReplies(normalizeQuickReplies(res.quick_reply_options));
          if (res.language) setLanguage(res.language);
          if (res.red_flag) setPriorityAlert(true);
          setStarting(false);
          return; // resumed — skip the fresh /start below entirely
        } catch {
          // Stale/finished/gone — clear it so this doesn't keep being tried
          // on every future mount, then fall through to starting fresh.
          writeStoredSessionId(null);
        }
      }

      try {
        const res = await startIntake(language);
        setSessionId(res.session_id);
        writeStoredSessionId(res.session_id);
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
    // Bumping the token invalidates any in-flight fetch or pending options
    // timer that was started for an earlier question.
    playTokenRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      // Reset so this element can't resume mid-sentence if it's reused.
      try {
        audioRef.current.currentTime = 0;
      } catch {
        /* not seekable yet — pause() is enough */
      }
    }
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
      // Always stop whatever is playing FIRST. Without this, a new question
      // arriving mid-sentence would layer its audio over the previous one
      // (two <audio> elements playing at once), which is the overlap the
      // patient hears. Applies equally to autoplay on a new turn and to a
      // "Listen" tap on an older question.
      stopPlayback();
      const token = playTokenRef.current;

      const audio = new Audio(`data:${mime || "audio/wav"};base64,${base64}`);
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
          // The patient may have answered during that pause — if so this
          // token is stale and the options readout must not interrupt the
          // question that has since started.
          if (playTokenRef.current !== token) return;
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
    // Snapshot the token so a slow fetch that lands after the patient has
    // already answered (or tapped a different question) is cached but not
    // played — newest request wins.
    const requestedAt = playTokenRef.current;
    try {
      const res = await replayIntakeAudio(sessionId, text);
      const payload = { base64: res.audio_base64, mime: res.audio_mime_type || "audio/wav" };
      setAudioByText((prev) => ({ ...prev, [text]: payload }));
      if (playTokenRef.current !== requestedAt) return;
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
  // Starts the browser's own recognizer for live interim text. Never
  // throws into the caller and never blocks recording: any failure here
  // just means no live preview, and the Sarvam path is untouched.
  function startLivePreview() {
    const SR = getSpeechRecognition();
    if (!SR) return; // unsupported browser — silent, recording still works
    try {
      const recognition = new SR();
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        // Rebuild the whole preview from every result each time rather than
        // appending the latest one: interim results are REVISED as the
        // recognizer hears more, so appending would duplicate the revised
        // words instead of replacing them.
        let text = "";
        for (let i = 0; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }
        const preview = text.trim();
        setLiveTranscript(preview);
        const typed = typedBeforeRecordingRef.current;
        const merged = typed ? `${typed} ${preview}` : preview;
        setInput(merged.slice(0, MAX_MESSAGE_LENGTH));
      };

      // 'no-speech'/'aborted'/'not-allowed' all just mean no live preview.
      // The recording itself is unaffected, and Sarvam still gets the audio.
      recognition.onerror = () => {};

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }

  function stopLivePreview() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
  }

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

      // Snapshot what was already typed BEFORE any interim text arrives, so
      // the live preview composes with it instead of overwriting it.
      typedBeforeRecordingRef.current = input.trim();
      setLiveTranscript("");
      startLivePreview();

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
    stopLivePreview();
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
        // Sarvam's transcript REPLACES whatever the live preview put in the
        // box — the two describe the same speech, so appending would
        // duplicate the whole answer. It composes against the text the
        // patient had typed BEFORE recording (the same snapshot the live
        // preview builds on), so anything they typed first still survives,
        // which is what the original append-don't-replace note protects.
        const typed = typedBeforeRecordingRef.current;
        const merged = typed ? `${typed} ${transcript}` : transcript;
        setInput(merged.slice(0, MAX_MESSAGE_LENGTH));
        setVoiceNote("");
      }
      setLiveTranscript("");
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
      stopLivePreview();
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
    setGateLoadingLongWait(false);
    setGateError("");
    const longWaitTimer = setTimeout(() => setGateLoadingLongWait(true), 8000);
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
      writeStoredSessionId(session.session_id);
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
    // Cut the current question's audio the instant the patient answers,
    // rather than waiting for the reply to arrive — otherwise the old
    // question keeps talking over them for the whole LLM round-trip.
    stopPlayback();
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
      playQuestionAudio(res);

      // The backend's own state machine reaching "finalize" with no more
      // questions is the signal to close out — not a guess on our side.
      if (res.section === "finalize") {
        await finalizeIntake(sessionId);
        setDone(true);
        // Nothing left to resume into once finalized — clear it so a later
        // "Start Visit Intake" click begins a genuinely new session instead
        // of trying (and failing) to resume this now-completed one.
        writeStoredSessionId(null);
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

  function isOtherConcernOption(option) {
    return ["Other", "Other concern", "Something else", "Other / Something else"].includes(option);
  }

  function handleSubmit(e) {
    e.preventDefault();

    const otherSelectedAlone = selectedOptions.includes("Other") && selectedOptions.length === 1 && !input.trim();
    if (otherRequired || otherSelectedAlone) {
      setOtherPrompt("Please explain your problem in the type section.");
      setOtherRequired(true);
      return;
    }

    setOtherPrompt("");
    setOtherRequired(false);
    submitAnswer(combinedAnswer());
  }

  function handleQuickReplyClick(opt) {
    if (isOtherConcernOption(opt)) {
      setOtherRequired(true);
      setOtherPrompt("Please explain your problem in the type section.");
      return;
    }

    setOtherRequired(false);
    setOtherPrompt("");
    submitAnswer(combinedAnswer(opt));
  }

  // Multi-select: tapping an option toggles it in/out of the running
  // selection. Nothing submits from here — the single Send button (see
  // below) is the only submit path for multi-select, same as free text.
  function toggleOption(opt) {
    setSelectedOptions((prev) => {
      const alreadySelected = prev.includes(opt);
      const next = alreadySelected ? prev.filter((o) => o !== opt) : [...prev, opt];

      if (isOtherConcernOption(opt)) {
        const hasInput = !!input.trim();
        const otherSelectedAlone = next.includes("Other") && next.length === 1 && !hasInput;
        if (otherSelectedAlone) {
          setOtherRequired(true);
          setOtherPrompt("Please explain your problem in the type section.");
        } else {
          setOtherRequired(false);
          setOtherPrompt("");
        }
      }

      return next;
    });
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
                : "Enter the check-in code shown at your doctor's clinic to begin."}
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
                        Enter the check-in code displayed at your doctor's clinic to start your intake.
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
                          : "Continue"}
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
                      {sendingLongWait
                        ? uiText(language).stillWorking
                        : uiText(language).thinking}
                    </div>
                  )}
                  {/* Completion marker. This used to repeat the closing
                      message as a hardcoded English sentence, which is why
                      a fully-Hindi session ended in English — and why the
                      finalize step LOOKED like it had fired before the
                      patient's medications answer was captured: the
                      backend's own (correctly-ordered) closing message and
                      this banner rendered as two nearly-identical bubbles
                      at the bottom of the transcript, pushing the patient's
                      answer up out of view. The answer was never lost —
                      drug_allergy -> finalize is gated server-side on
                      drugAllergyComplete(), which requires BOTH
                      current_medications and allergies to be non-empty
                      arrays before the section can advance at all. So this
                      is now a plain status marker with no message text of
                      its own: the closing message is the backend's, shown
                      once, in the session's language, in its correct place
                      in the transcript. */}
                  {done && (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-sm">
                      <CheckCircle2 size={16} />
                      {language === "en-IN" ? "Intake complete" : "इंटेक पूरा हुआ"}
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
                              onClick={() => handleQuickReplyClick(opt)}
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
                      at once (Voice Layer PRD §6): listen, type, and speak
                      are never behind a "voice user vs text user" branch —
                      someone who types fluently can still listen, and
                      someone who spoke last turn can still type this one.
                      The single submit path below is upstream's — there
                      used to be two (this form's submit, and a separate
                      "Send selected" next to the checkboxes), each reading
                      only its own piece of state and silently dropping the
                      other. The mic deliberately does NOT add a third: it
                      writes into the same input this form already reads. */}
                  {voiceNote && (
                    <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {voiceNote}
                    </p>
                  )}

                  {/* Live-captioning indicator. The interim words themselves
                      go straight into the answer field (so the patient can
                      edit them like anything else they typed); this only
                      says the mic is live and echoes the current partial,
                      which is what makes it read as real-time rather than
                      as a field that fills in at the end. Absent entirely
                      in browsers with no SpeechRecognition — there the
                      recording flow is exactly as it was. */}
                  {isRecording && (
                    <p
                      className="mb-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2"
                      aria-live="polite"
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                      <span className="truncate">
                        {liveTranscript || uiText(language).listening}
                      </span>
                    </p>
                  )}

                  <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    {/* ONE speaker control: a mute toggle for autoplay of
                        new questions, with the icon reflecting the current
                        state. Replaying a specific question is a separate
                        affordance — the small speaker under each question
                        bubble in the transcript. Muting persists across
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

                    <div className="flex-1 min-w-0">
                      {otherPrompt && (
                        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          {otherPrompt}
                        </div>
                      )}
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => {
                          const nextValue = e.target.value.slice(0, MAX_MESSAGE_LENGTH);
                          setInput(nextValue);

                          const otherSelectedAlone = selectedOptions.includes("Other") && selectedOptions.length === 1;
                          if (otherSelectedAlone && !nextValue.trim()) {
                            setOtherPrompt("Please explain your problem in the type section.");
                            setOtherRequired(true);
                          } else {
                            setOtherPrompt("");
                            setOtherRequired(false);
                          }
                        }}
                        maxLength={MAX_MESSAGE_LENGTH}
                        placeholder={
                          isRecording
                            ? uiText(language).listening
                            : isTranscribing
                            ? uiText(language).transcribing
                            : uiText(language).typeAnswer
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 "
                        disabled={sending}
                      />
                    </div>

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
                      disabled={
                        sending ||
                        isRecording ||
                        ((selectedOptions.includes("Other") && selectedOptions.length === 1 && !input.trim()) || otherRequired) ||
                        (!input.trim() && selectedOptions.length === 0)
                      }
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
                  {uiText(language).backToDashboard}
                </button>
              )}

              <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-3">
                <ShieldCheck size={13} className="text-slate-400 shrink-0" />
                {uiText(language).disclaimer}
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
