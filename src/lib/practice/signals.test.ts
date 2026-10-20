import { describe, expect, it } from "vitest";
import { answerMetrics } from "../scoring/metrics";
import { DIMENSIONS, type Dimension, type QuestionReport, type Report } from "../scoring/types";
import { weaknessSignals } from "./signals";

const question = (id: string, stage: QuestionReport["stage"], scores: Partial<Record<Dimension, number>>): QuestionReport => ({
  questionId: id,
  question: `${id}?`,
  stage,
  competency: `${id} competency`,
  dimensions: DIMENSIONS.map((dimension) => ({ dimension, score: scores[dimension] ?? 4, rationale: "", evidence: [] })),
  rejectedQuotes: 0,
  strengths: [],
  improvements: [],
  strongerAnswer: "",
  metrics: answerMetrics(""),
});

const report = (questions: QuestionReport[], text = ""): Report => {
  const core = questions.filter((q) => q.stage === "behavioral" || q.stage === "technical");
  const dimensionAverages = Object.fromEntries(
    DIMENSIONS.map((d) => [
      d,
      core.reduce((a, q) => a + q.dimensions.find((x) => x.dimension === d)!.score, 0) / core.length,
    ]),
  ) as Record<Dimension, number>;
  return {
    model: "test",
    summary: { headline: "", strengths: [], priorities: [], overallScore: 3, dimensionAverages },
    questions,
    metrics: answerMetrics(text),
  };
};

describe("weaknessSignals", () => {
  it("flags weak dimensions and points at the worst answer", () => {
    const signals = weaknessSignals(
      report([question("q1", "intro", { impact: 1 }), question("q2", "behavioral", { impact: 2 }), question("q3", "behavioral", { impact: 3 })]),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ skill: "quantifying-impact", dimension: "impact", questionId: "q2", score: 2 });
  });

  it("ignores the intro and wrap-up when deciding what's weak", () => {
    expect(weaknessSignals(report([question("q1", "intro", { structure: 1 }), question("q2", "behavioral", {})]))).toEqual([]);
  });

  it("flags weak technical answers for the coach to map to a skill", () => {
    const signals = weaknessSignals(report([question("q2", "technical", { specificity: 2, impact: 2, relevance: 3 })]));
    expect(signals.find((s) => s.skill === "technical")).toMatchObject({ questionId: "q2" });
  });

  it("flags hedging and filler words from the counted metrics", () => {
    const text = "Um, I think, maybe, it was, like, fine. I guess, um, I'm not sure, basically it probably worked.";
    const skills = weaknessSignals(report([question("q2", "behavioral", {})], text)).map((s) => s.skill);
    expect(skills).toEqual(expect.arrayContaining(["confident-delivery", "filler-words"]));
  });

  it("orders by severity", () => {
    const signals = weaknessSignals(report([question("q2", "behavioral", { structure: 3, ownership: 1 })]));
    expect(signals.map((s) => s.dimension)).toEqual(["ownership", "structure"]);
  });
});
