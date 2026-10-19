// Without headphones the mic hears the interviewer's own voice. Browser echo
// cancellation catches most of it; this catches the rest, so the interviewer
// doesn't "barge in" on itself or take its own words as an answer.

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * True when `heard` looks like STT of `spoken` rather than new speech: most of
 * its word pairs appear in `spoken`. Pairs rather than single words, so an
 * answer that reuses the question's vocabulary doesn't count as echo.
 */
export function isEcho(heard: string, spoken: string): boolean {
  const h = words(heard);
  const s = words(spoken);
  if (!h.length || !s.length) return false;
  if (h.length === 1) return s.includes(h[0]);
  const pairs = new Set(s.slice(1).map((w, i) => `${s[i]} ${w}`));
  let hits = 0;
  for (let i = 1; i < h.length; i++) if (pairs.has(`${h[i - 1]} ${h[i]}`)) hits++;
  return hits / (h.length - 1) >= 0.5;
}
