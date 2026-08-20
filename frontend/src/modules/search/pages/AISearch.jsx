import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { searchReports } from "../../../api/search";
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
  ClipboardList,
  Settings,
  HelpCircle,
  UploadCloud,
  Sparkles,
  Send,
  FileText,
  Loader2,
  ExternalLink,
  Stethoscope,
} from "lucide-react";

// Same nav list as Dashboard.jsx / Timeline.jsx / etc.
const navItems = [
  { label: "Dashboard", icon: LayoutGrid, route: "/dashboard" },
  { label: "Health Timeline", icon: TrendingUp, route: "/timeline" },
  { label: "Medical Vault", icon: Folder, route: "/vault" },
  { label: "Family Records", icon: Users, route: "/family-vault" },
  { label: "Doctor Requests", icon: Stethoscope, route: "/doctor-requests" },
  { label: "Lab Insights", icon: TrendingUp, route: "/lab-trends" },
  { label: "Ask Swastha", icon: Sparkles, route: "/search" },
];

const EXAMPLE_QUESTIONS = [
  "What medications was I prescribed for hypertension?",
  "When was my last blood test and what were the results?",
  "Summarize my vaccination history.",
];

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
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 ">
            <HelpCircle size={18} />
            Support
          </button>
        </div>
      </div>
    </aside>
  );
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AISearch() {
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', text, sources?, noResultsFound? }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  async function runSearch(trimmed) {
    if (!trimmed || loading) return;

    setError(null);
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setQuery("");
    setLoading(true);

    try {
      const result = await searchReports(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result.answer,
          structured: result.structured || null,
          sources: result.sources || [],
          noResultsFound: result.noResultsFound,
        },
      ]);
    } catch (err) {
      setError(err.message || "Search failed. Please try again.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong answering that. Please try again.", sources: [], isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(query.trim());
  }

  // Auto-run a query handed off from elsewhere in the app, e.g. the
  // Dashboard header search box navigating to /search?q=... Only fires
  // once per incoming query, and only once auth state is known.
  const location = useLocation();
  const ranInitialQuery = useRef(false);
  useEffect(() => {
    if (ranInitialQuery.current || !isAuthenticated) return;
    const params = new URLSearchParams(location.search);
    const initialQuery = params.get("q")?.trim();
    if (initialQuery) {
      ranInitialQuery.current = true;
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, location.search]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 ">
      <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white ">
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-400 transition-colors hover:border-blue-300 hover:text-blue-600 "
          >
            <Sparkles size={16} />
            Ask Swastha about your health records...
          </button>

          <PatientNotifications />

          <PatientIdBadge />

          <ProfileDropdown />
        </header>

      <main className="flex-1 overflow-y-auto px-10 py-8 flex flex-col max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="text-blue-600" size={24} />
            Ask Swastha
          </h1>
          <p className="text-slate-500 mt-1">
            Ask a question about your health records in plain language — answers are grounded
            only in your saved reports.
          </p>
        </div>

        {!isAuthenticated ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-slate-500 ">
            Please log in to search your health records.
          </div>
        ) : (
          <>
            <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-4 overflow-y-auto min-h-[320px] max-h-[60vh]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                    <Sparkles size={22} />
                  </div>
                  <p className="text-slate-600 font-medium mb-1">Ask anything about your records</p>
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
                      Searching your records...
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
                placeholder="e.g. What was my blood sugar level in my last report?"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 "
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

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
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
            ? "bg-red-50 text-red-700 border border-red-100 "
            : "bg-slate-50 text-slate-700 border border-slate-100 "
        }`}
      >
        {/* Headline — the direct one-line answer */}
        <p className="whitespace-pre-wrap font-medium text-slate-800 ">
          {structured?.headline || message.text}
        </p>

        {/* Key facts — structured supporting details, each traceable to a source */}
        {hasKeyFacts && (
          <ul className="mt-3 space-y-2">
            {structured.keyFacts.map((fact, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <span>
                  {fact.label && (
                    <span className="font-semibold text-slate-800 ">{fact.label}: </span>
                  )}
                  <span className="text-slate-600 ">{fact.detail}</span>
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
      <FileText size={13} className="shrink-0 text-slate-400 " />
      <span className="font-medium text-slate-600 truncate">{source.title || "Untitled report"}</span>
      {source.category && <span className="text-slate-400 shrink-0">· {source.category}</span>}
      {formatDate(source.report_date) && (
        <span className="text-slate-400 shrink-0">· {formatDate(source.report_date)}</span>
      )}
    </>
  );

  if (!source.file_url) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 px-2 py-1.5">
        {content}
      </div>
    );
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
