import React, { useEffect, useRef, useState } from "react";
import DoctorSidebar from "../components/DoctorSidebar";
import ProfileDropdown from "../../settings/components/ProfileDropdown";
import NotificationBell from "../../../components/Common/NotificationBell";
import LanguageToggle from "../../../components/Common/LanguageToggle";
import { searchResearch } from "../../../api/research";
import { BookOpenCheck, Search, Loader2, ExternalLink, ShieldAlert, AlertCircle, Info } from "lucide-react";

const EXAMPLE_QUERIES = [
  "Asthma inhaler guidance",
  "Dengue clinical management protocol",
  "Metformin contraindications",
  "Standard treatment for drug-sensitive TB",
];

// Filters the results already on screen (each result carries a `region`);
// switching never triggers a new search.
const SCOPES = [
  { value: "all", label: "All sources" },
  { value: "india", label: "India" },
  { value: "global", label: "Global" },
];

const STAGES = ["Searching official sources…", "Reading the top pages…"];

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function DoctorResearch() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState(null);
  // { query, data } for the last completed search
  const [outcome, setOutcome] = useState(null);
  const latestRequest = useRef(0);

  // Purely cosmetic: the backend runs search then page-reading in one call,
  // so this just advances the status text after a beat.
  useEffect(() => {
    if (!loading) return undefined;
    setStage(0);
    const timer = setTimeout(() => setStage(1), 2500);
    return () => clearTimeout(timer);
  }, [loading]);

  async function runSearch(rawQuery) {
    const trimmed = rawQuery.trim();
    if (!trimmed || loading) return;

    const requestId = ++latestRequest.current;
    setQuery(trimmed);
    setError(null);
    setLoading(true);
    try {
      const data = await searchResearch(trimmed);
      if (requestId !== latestRequest.current) return;
      setOutcome({ query: trimmed, data });
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setOutcome(null);
      setError(
        err.status === 429
          ? "You're searching a bit too quickly. Please wait a moment and try again."
          : err.message || "Something went wrong running that search. Please try again."
      );
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runSearch(query);
  }

  const allResults = outcome?.data?.results || [];
  const counts = {
    all: allResults.length,
    india: allResults.filter((r) => r.region === "india").length,
    global: allResults.filter((r) => r.region === "global").length,
  };
  const results = scope === "all" ? allResults : allResults.filter((r) => r.region === scope);
  const scopeLabel = SCOPES.find((s) => s.value === scope)?.label;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <DoctorSidebar />

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="shrink-0 flex items-center justify-end gap-4 px-6 lg:px-8 py-5 border-b border-slate-200 bg-white">
          <NotificationBell />

          <LanguageToggle />
          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto px-6 md:px-10 py-8 max-w-4xl mx-auto w-full">
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100/60 px-6 py-6 mb-5">
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <BookOpenCheck className="text-blue-600" size={22} />
              Research
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Look up public medical guidance from official sources (WHO, CDC, NIH, NHS, NICE, ICMR, MoHFW and more).
            </p>
          </div>

          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 mb-5">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <span>
              These are excerpts from external public sources, not patient records. Verify against the original before
              clinical use, and don't enter patient names or identifiers.
            </span>
          </div>

          <form onSubmit={handleSubmit} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 mb-5">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={200}
                  placeholder="Ask a general medical question…"
                  className="w-full pl-10 pr-3 py-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading || query.trim().length < 3}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                Search
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden mr-2" role="group" aria-label="Source scope">
                {SCOPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setScope(s.value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      scope === s.value ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {s.label}
                    {outcome && <span className="ml-1 opacity-70">({counts[s.value]})</span>}
                  </button>
                ))}
              </div>
              {EXAMPLE_QUERIES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => runSearch(example)}
                  disabled={loading}
                  className="text-xs text-slate-600 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </form>

          {loading && (
            <div className="flex items-center gap-2.5 text-sm text-slate-500 px-1 py-6">
              <Loader2 size={16} className="animate-spin text-blue-600" />
              {STAGES[stage]}
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && outcome && results.length === 0 && (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center text-sm text-slate-500">
              {allResults.length === 0
                ? `No official sources found for "${outcome.query}". Try rephrasing.`
                : `None of the results for "${outcome.query}" are from ${scopeLabel} sources. Switch the filter to see the rest.`}
            </div>
          )}

          {!loading && results.length > 0 && (
            <section aria-label="Search results">
              <p className="text-xs text-slate-400 mb-3 px-1">
                {results.length} result{results.length === 1 ? "" : "s"} for "{outcome.query}" · retrieved{" "}
                {new Date(outcome.data.retrievedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·
                Powered by TinyFish
              </p>
              <ul className="space-y-3">
                {results.map((r) => (
                  <li key={r.url} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 bg-blue-50 rounded-md px-2 py-0.5">
                        {r.source}
                      </span>
                      <span className="text-xs text-slate-400 truncate">{r.domain}</span>
                      {formatDate(r.date) && <span className="text-xs text-slate-400">· {formatDate(r.date)}</span>}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 leading-snug">{r.title}</h3>
                    {/* Plain text only — page content is never rendered as HTML. */}
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">{r.excerpt}</p>
                    {r.excerptFrom === "snippet" && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                        <Info size={12} />
                        Search snippet only. Open the original for the full text.
                      </p>
                    )}
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      Open original
                      <ExternalLink size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!loading && !error && !outcome && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">
              Search a topic above or pick an example to see excerpts from official sources.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
