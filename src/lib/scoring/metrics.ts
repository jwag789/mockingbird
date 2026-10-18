// Deterministic speaking metrics. These are counted in code, not judged by
// the model, so they're exact and repeatable.

export type AnswerMetrics = {
  words: number;
  fillers: number;
  fillersPer100Words: number;
  fillerBreakdown: Record<string, number>;
  /** "I / me / my" mentions. */
  firstPersonSingular: number;
  /** "we / us / our" mentions. */
  firstPersonPlural: number;
  /** Share of first-person mentions that are "I" rather than "we"; null with no mentions. */
  ownershipRatio: number | null;
};

// "like" only counts when it's set off by commas ("it was, like, slow"),
// so "I'd like to" and "looks like" don't.
const FILLER_PATTERNS: Array<[label: string, pattern: RegExp]> = [
  ["um", /\b(um+|uhm+)\b/g],
  ["uh", /\b(uh+|erm+)\b/g],
  ["like", /,\s*like\s*,/g],
  ["you know", /\byou know\b(?!\s+(?:what|how|that|when|why|where|who|if))/g],
  ["basically", /\bbasically\b/g],
  ["sort of", /\bsort of\b/g],
  ["kind of", /\bkind of\b/g],
  ["I mean", /\bi mean\b/g],
  ["literally", /\bliterally\b/g],
];

const SINGULAR = /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself)\b/g;
const PLURAL = /\b(we|we're|we've|we'd|we'll|us|our|ours|ourselves)\b/g;

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

export function answerMetrics(text: string): AnswerMetrics {
  const lower = text.toLowerCase().replace(/[’‘]/g, "'");
  const words = lower.split(/\s+/).filter(Boolean).length;

  const fillerBreakdown: Record<string, number> = {};
  let fillers = 0;
  for (const [label, re] of FILLER_PATTERNS) {
    const n = count(lower, re);
    if (n > 0) fillerBreakdown[label] = n;
    fillers += n;
  }

  const singular = count(lower, SINGULAR);
  const plural = count(lower, PLURAL);

  return {
    words,
    fillers,
    fillersPer100Words: words ? round1((fillers / words) * 100) : 0,
    fillerBreakdown,
    firstPersonSingular: singular,
    firstPersonPlural: plural,
    ownershipRatio: singular + plural ? round2(singular / (singular + plural)) : null,
  };
}

export function combineMetrics(all: AnswerMetrics[]): AnswerMetrics {
  const words = sum(all.map((m) => m.words));
  const fillers = sum(all.map((m) => m.fillers));
  const singular = sum(all.map((m) => m.firstPersonSingular));
  const plural = sum(all.map((m) => m.firstPersonPlural));
  const fillerBreakdown: Record<string, number> = {};
  for (const m of all) {
    for (const [k, v] of Object.entries(m.fillerBreakdown)) {
      fillerBreakdown[k] = (fillerBreakdown[k] ?? 0) + v;
    }
  }
  return {
    words,
    fillers,
    fillersPer100Words: words ? round1((fillers / words) * 100) : 0,
    fillerBreakdown,
    firstPersonSingular: singular,
    firstPersonPlural: plural,
    ownershipRatio: singular + plural ? round2(singular / (singular + plural)) : null,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
