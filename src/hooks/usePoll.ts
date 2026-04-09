// src/hooks/usePoll.ts
// Generic polling hook for Live Tournament Tracker.
// Calls fn on mount and every intervalMs while enabled is true.
// Pauses when tab is hidden, resumes on focus.

import { useEffect, useRef, useState, useCallback } from "react";

interface UsePollResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePoll<T>(
  fn: () => Promise<T>,
  intervalMs: number,
  enabled: boolean = true
): UsePollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fnRef = useRef(fn);

  // Keep fn ref current without retriggering effect
  fnRef.current = fn;

  const execute = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Poll failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await execute();
  }, [execute]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Initial fetch
    execute();

    // Start interval
    timerRef.current = setInterval(execute, intervalMs);

    // Pause on tab hidden, resume on focus
    const onVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      } else {
        execute();
        timerRef.current = setInterval(execute, intervalMs);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled, execute]);

  return { data, loading, error, refresh };
}
