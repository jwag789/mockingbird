// Labels each spoken word for playback: part of a quote the scorer used,
// a filler, or a hedge. Pure, so it runs in the browser and is unit tested.
import type { ClipWord } from "../scoring/talk-time";

export type AnnotatedWord = ClipWord & { quote: boolean; filler: boolean; hedge: boolean };

const FILLERS = [["um"], ["umm"], ["uh"], ["uhm"], ["erm"], ["basically"], ["literally"], ["you", "know"], ["sort", "of"], ["kind", "of"], ["i", "mean"]];
const HEDGES = [["i", "think"], ["i", "guess"], ["i", "feel", "like"], ["i", "suppose"], ["not", "sure"], ["maybe"], ["probably"], ["perhaps"], ["hopefully"], ["might", "have"]];
// "you know" is a filler only when it isn't the start of a real question or clause.
const YOU_KNOW_EXCEPT = new Set(["what", "how", "that", "when", "why", "where", "who", "if"]);

const token = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, "");

export function annotate(words: ClipWord[], quotes: string[]): AnnotatedWord[] {
  const tokens = words.map((w) => token(w.w));
  const out: AnnotatedWord[] = words.map((w) => ({ ...w, quote: false, filler: false, hedge: false }));

  for (const quote of quotes) {
    const q = quote.split(/\s+/).map(token).filter(Boolean);
    if (q.length < 3) continue;
    for (let i = 0; i + q.length <= tokens.length; i++) {
      if (q.every((t, j) => tokens[i + j] === t)) {
        for (let j = 0; j < q.length; j++) out[i + j].quote = true;
        break;
      }
    }
  }

  const mark = (phrases: string[][], key: "filler" | "hedge") => {
    for (let i = 0; i < tokens.length; i++) {
      for (const p of phrases) {
        if (!p.every((t, j) => tokens[i + j] === t)) continue;
        if (p.join(" ") === "you know" && YOU_KNOW_EXCEPT.has(tokens[i + 2] ?? "")) continue;
        for (let j = 0; j < p.length; j++) out[i + j][key] = true;
      }
    }
  };
  mark(FILLERS, "filler");
  mark(HEDGES, "hedge");
  return out;
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
