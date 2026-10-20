// Finds what to practice, from a scorecard. Deterministic: the coach (Claude)
// writes the tasks, but which weaknesses exist is decided here.
import { DIMENSION_LABELS, type Dimension, type Report } from "../scoring/types";
import type { Skill } from "./skills";

export type Signal = {
  /** A skill, or "technical" for a weak technical answer the coach maps to a technical skill. */
  skill: Skill | "technical";
  reason: string;
  /** Bigger is worse. Used to order the plan. */
  severity: number;
  questionId?: string;
  dimension?: Dimension;
  score?: number;
};

export const DIMENSION_SKILL: Record<Dimension, Skill> = {
  structure: "story-structure",
  specificity: "specific-examples",
  ownership: "showing-ownership",
  impact: "quantifying-impact",
  relevance: "answering-the-question",
};

export const WEAK_BELOW = 3.5;
const HEDGES_PER_100 = 1.5;
const FILLERS_PER_100 = 3;
const PACE = { slow: 115, fast: 175 };

export function weaknessSignals(report: Report): Signal[] {
  const signals: Signal[] = [];
  const core = report.questions.filter((q) => q.stage === "behavioral" || q.stage === "technical");

  for (const dim of Object.keys(DIMENSION_SKILL) as Dimension[]) {
    const avg = report.summary.dimensionAverages[dim];
    if (!core.length || avg >= WEAK_BELOW) continue;
    // Point at the answer where it showed most.
    const worst = core
      .map((q) => ({ q, score: q.dimensions.find((d) => d.dimension === dim)!.score }))
      .sort((a, b) => a.score - b.score)[0];
    signals.push({
      skill: DIMENSION_SKILL[dim],
      reason: `${DIMENSION_LABELS[dim]} averaged ${avg.toFixed(1)}/5 across your behavioral and technical answers.`,
      severity: WEAK_BELOW - avg,
      questionId: worst.q.questionId,
      dimension: dim,
      score: worst.score,
    });
  }

  for (const q of core.filter((q) => q.stage === "technical")) {
    const avg = q.dimensions.reduce((a, d) => a + d.score, 0) / q.dimensions.length;
    if (avg >= WEAK_BELOW) continue;
    signals.push({
      skill: "technical",
      reason: `Your technical answer on "${q.competency}" averaged ${avg.toFixed(1)}/5.`,
      severity: WEAK_BELOW - avg + 0.25, // weak technical depth usually costs more than delivery
      questionId: q.questionId,
      score: Math.round(avg * 10) / 10,
    });
  }

  const m = report.metrics;
  if ((m.hedgesPer100Words ?? 0) >= HEDGES_PER_100) {
    signals.push({
      skill: "confident-delivery",
      reason: `You used ${m.hedges} hedging phrases (${top(m.hedgeBreakdown)}), about ${m.hedgesPer100Words} per 100 words.`,
      severity: Math.min(1.5, m.hedgesPer100Words / HEDGES_PER_100 - 0.5),
    });
  }
  if (m.fillersPer100Words >= FILLERS_PER_100) {
    signals.push({
      skill: "filler-words",
      reason: `${m.fillersPer100Words} filler words per 100 words (${top(m.fillerBreakdown)}).`,
      severity: Math.min(1.5, m.fillersPer100Words / FILLERS_PER_100 - 0.5),
    });
  }
  if (m.wordsPerMinute != null && (m.wordsPerMinute < PACE.slow || m.wordsPerMinute > PACE.fast)) {
    signals.push({
      skill: "speaking-pace",
      reason: `You spoke at ${m.wordsPerMinute} words per minute; ${PACE.slow + 5}-${PACE.fast - 15} is easiest to follow.`,
      severity: 0.6,
    });
  }

  return signals.sort((a, b) => b.severity - a.severity);
}

function top(counts: Record<string, number> = {}): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word, n]) => `"${word}" ×${n}`)
    .join(", ");
}
