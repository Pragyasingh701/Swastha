import React, { useEffect, useRef, useState } from "react";
import { KeyRound, Printer, Loader2 } from "lucide-react";
import { getTodayCheckinCode } from "../../../api/clinic";

// Doctor dashboard — today's clinic check-in code (PRD §3.2/§5). Fetches
// once on mount, then re-fetches automatically at local midnight so the
// screen doesn't need a manual refresh to show the new day's code, and
// keeps scheduling the next midnight refresh after that — meant to be left
// open on a wall-mounted display or reception screen for the whole day.
//
// "Print for front desk" does NOT call window.print() on the live page —
// that would print the entire dashboard (sidebar, stat cards, everything
// else on screen), since print:* utility classes on THIS card alone can't
// hide unrelated components elsewhere on the page that have no print
// awareness. Instead it builds a small isolated print document (just the
// code + date + one-line instruction) in a hidden iframe and prints only
// that — the standard reliable way to print "just this" regardless of
// what else is on the page.

function msUntilNextLocalMidnight() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5); // +5s slack past midnight
  return nextMidnight.getTime() - now.getTime();
}

function printCodeOnly({ code, dateLabel }) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Check-In Code</title>
    <style>
      @page { size: landscape; margin: 0.5in; }
      html, body {
        height: 100%;
        margin: 0;
      }
      body {
        font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .label { font-size: 28px; letter-spacing: 0.15em; text-transform: uppercase; color: #333; margin-bottom: 8px; }
      .date { font-size: 22px; color: #666; margin-bottom: 48px; }
      /* vw-based so it scales to fill the landscape sheet regardless of
         code length or paper size, capped so a very short code doesn't
         balloon past a sensible max on large paper. */
      .code { font-size: min(22vw, 260px); font-weight: 900; letter-spacing: 0.2em; line-height: 1; white-space: nowrap; }
      .instruction { font-size: 24px; color: #555; margin-top: 48px; }
    </style>
  </head>
  <body>
    <div class="label">Today's Check-In Code</div>
    <div class="date">${dateLabel}</div>
    <div class="code">${code}</div>
    <div class="instruction">Patients enter this code at Check-In to start their visit intake.</div>
  </body>
</html>`);
  doc.close();

  // Give the iframe a tick to lay out before invoking print, then remove
  // it shortly after — printing is synchronous-enough in practice that a
  // short delay is safe and avoids leaking iframes if the user cancels.
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

export default function CheckInCodeCard() {
  const [code, setCode] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getTodayCheckinCode();
      setCode(result.code);
    } catch (err) {
      setError(err.message || "Unable to load check-in code.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();

    function scheduleMidnightRefresh() {
      timeoutRef.current = setTimeout(() => {
        load();
        scheduleMidnightRefresh(); // re-arm for the following midnight
      }, msUntilNextLocalMidnight());
    }
    scheduleMidnightRefresh();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-1 text-slate-500">
        <KeyRound size={16} />
        <span className="text-sm font-semibold uppercase tracking-wide">Today's Check-In Code</span>
      </div>
      <p className="text-xs text-slate-400 mb-4">{todayLabel}</p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Loading...
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 py-4 text-center">{error}</div>
      ) : (
        <div className="text-center py-4">
          <span className="text-5xl md:text-6xl font-black tracking-[0.25em] text-blue-700">
            {code}
          </span>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center mb-4">
        Patients enter this code at Check-In to start their visit intake.
      </p>

      <button
        type="button"
        disabled={isLoading || !!error || !code}
        onClick={() => printCodeOnly({ code, dateLabel: todayLabel })}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl py-2.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Printer size={16} />
        Print for front desk
      </button>
    </div>
  );
}
