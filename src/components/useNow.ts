import { useCallback, useSyncExternalStore } from "react";

/**
 * The current time, ticking every `intervalMs`, or null during server render
 * and hydration. Reading the clock only in the browser keeps pages
 * prerenderable and avoids hydration mismatches.
 */
export function useNow(intervalMs: number): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const timer = setInterval(onChange, intervalMs);
      return () => clearInterval(timer);
    },
    [intervalMs],
  );
  // Rounded to the interval so the snapshot is stable between ticks.
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  );
}
