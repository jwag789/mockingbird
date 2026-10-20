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
  /** Hedging phrases ("I guess", "maybe", "I'm not sure"): the text signal for sounding unsure. */
  hedges: number;
  hedgesPer100Words: number;
  hedgeBreakdown: Record<string, number>;
  /** Ms spent speaking, from speech-to-text word timings; null when nothing was spoken (text mode). */
  talkMs: number | null;
  /** Words in the spoken answers, the basis for pace. */
  spokenWords: number;
  /** Speaking pace across the spoken answers; null when nothing was spoken. */
  wordsPerMinute: number | null;
};

/** Present for answers given in voice mode. */
export type Speech = { talkMs: number };

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

const HEDGE_PATTERNS: Array<[label: string, pattern: RegExp]> = [
  ["I think", /\bi think\b/g],
  ["I guess", /\bi guess\b/g],
  ["I feel like", /\bi feel like\b/g],
  ["I'm not sure", /\bi'?m not (?:really )?sure\b/g],
  ["maybe", /\bmaybe\b/g],
  ["probably", /\bprobably\b/g],
  ["perhaps", /\bperhaps\b/g],
  ["hopefully", /\bhopefully\b/g],
  ["I suppose", /\bi suppose\b/g],
  ["might have", /\bmight have\b/g],
];

const SINGULAR = /\b(i|i'm|i've|i'd|i'll|me|my|mine|myself)\b/g;
const PLURAL = /\b(we|we're|we've|we'd|we'll|us|our|ours|ourselves)\b/g;

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

export function answerMetrics(text: string, speech?: Speech): AnswerMetrics {
  const lower = text.toLowerCase().replace(/[’‘]/g, "'");
  const words = lower.split(/\s+/).filter(Boolean).length;

  const { total: fillers, breakdown: fillerBreakdown } = tally(lower, FILLER_PATTERNS);
  const { total: hedges, breakdown: hedgeBreakdown } = tally(lower, HEDGE_PATTERNS);

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
    hedges,
    hedgesPer100Words: words ? round1((hedges / words) * 100) : 0,
    hedgeBreakdown,
    ...pace(speech ? words : 0, speech ? speech.talkMs : null),
  };
}

export function combineMetrics(all: AnswerMetrics[]): AnswerMetrics {
  const words = sum(all.map((m) => m.words));
  const fillers = sum(all.map((m) => m.fillers));
  const singular = sum(all.map((m) => m.firstPersonSingular));
  const plural = sum(all.map((m) => m.firstPersonPlural));
  const hedges = sum(all.map((m) => m.hedges ?? 0));
  const talk = all.filter((m) => m.talkMs != null);
  const fillerBreakdown = mergeCounts(all.map((m) => m.fillerBreakdown));
  // Reports saved before hedges were counted have no breakdown.
  const hedgeBreakdown = mergeCounts(all.map((m) => m.hedgeBreakdown ?? {}));
  return {
    words,
    fillers,
    fillersPer100Words: words ? round1((fillers / words) * 100) : 0,
    fillerBreakdown,
    firstPersonSingular: singular,
    firstPersonPlural: plural,
    ownershipRatio: singular + plural ? round2(singular / (singular + plural)) : null,
    hedges,
    hedgesPer100Words: words ? round1((hedges / words) * 100) : 0,
    hedgeBreakdown,
    ...pace(
      sum(talk.map((m) => m.spokenWords)),
      talk.length ? sum(talk.map((m) => m.talkMs!)) : null,
    ),
  };
}

function tally(text: string, patterns: Array<[string, RegExp]>) {
  const breakdown: Record<string, number> = {};
  let total = 0;
  for (const [label, re] of patterns) {
    const n = count(text, re);
    if (n > 0) breakdown[label] = n;
    total += n;
  }
  return { total, breakdown };
}

function mergeCounts(all: Array<Record<string, number>>): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const counts of all) {
    for (const [k, v] of Object.entries(counts)) merged[k] = (merged[k] ?? 0) + v;
  }
  return merged;
}

// Pace counts pauses inside an answer, the way a listener hears it.
function pace(spokenWords: number, talkMs: number | null) {
  return {
    talkMs,
    spokenWords,
    wordsPerMinute: talkMs ? Math.round(spokenWords / (talkMs / 60_000)) : null,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
