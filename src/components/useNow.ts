import { useCallback, useSyncExternalStore } from "react";

/**
 * The current time, ticking every `intervalMs`, or null during server render
 * and hydration. Reading the clock only in the browser keeps pages
 * prerenderable and avoids hydration mismatches.
 */
export function useNow(intervalMs: number): number | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      // Tick once right away: hydration renders the server snapshot (null),
      // and a long interval would otherwise leave that showing for a while.
      const first = setTimeout(onChange, 0);
      const timer = setInterval(onChange, intervalMs);
      return () => {
        clearTimeout(first);
        clearInterval(timer);
      };
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
