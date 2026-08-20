import { useEffect, useRef, useCallback } from "react";

/**
 * Keeps a fetch function re-running so a page doesn't go stale between
 * hard refreshes — used for the doctor/patient request-status flow, which
 * has no other live-update mechanism (see decision below).
 *
 * Why this instead of Supabase Realtime: the frontend has no Supabase
 * client anywhere in the codebase today (grep for `.channel(`,
 * `postgres_changes`, `createClient` in frontend/src/ turns up nothing —
 * every DB access goes through the backend REST API). Realtime would mean
 * shipping the Supabase JS SDK to the browser for the first time, an anon
 * key, and an RLS story that doesn't exist yet (every table has RLS
 * enabled with ZERO policies — service-role-only access is the only
 * working path right now, see db-reorg-plan.md D5). That's a real
 * architecture change, not a fix for "the list doesn't refresh". Polling +
 * refetch-on-focus needs none of that and matches how every other list in
 * this app already loads data (a plain useEffect + service call).
 *
 * Triggers a re-fetch on:
 *   - mount (immediately, via the caller's own initial load - this hook
 *     does NOT fetch on mount itself, to avoid a double first fetch when
 *     the caller already has its own mount-time load)
 *   - every `intervalMs` while the tab is visible (paused when hidden, so
 *     a backgrounded tab doesn't keep hammering the API)
 *   - the tab regaining focus/visibility (covers "accepted via email in
 *     another tab, switched back here")
 *
 * @param {() => void | Promise<void>} fetchFn - stable-ish callback; wrap
 *   the caller's fetch in useCallback so this effect doesn't re-subscribe
 *   on every render.
 * @param {{ intervalMs?: number, enabled?: boolean }} [options]
 *   intervalMs: polling interval while visible (default 20000 = 20s,
 *   matching the 15-20s range asked for). enabled: pass false to pause
 *   entirely (e.g. a dropdown that's currently closed).
 */
export function usePolling(fetchFn, { intervalMs = 20000, enabled = true } = {}) {
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const runFetch = useCallback(() => {
    fetchRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        runFetch();
      }
    }

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    const intervalId = setInterval(() => {
      // Skip the tick entirely while backgrounded rather than fetching
      // into a tab nobody's looking at.
      if (document.visibilityState === "visible") {
        runFetch();
      }
    }, intervalMs);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      clearInterval(intervalId);
    };
  }, [enabled, intervalMs, runFetch]);
}

export default usePolling;
