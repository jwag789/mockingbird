import { z } from "zod";
import type { Stage } from "../interview/types";
import type { AnswerMetrics } from "./metrics";

export const DIMENSIONS = ["structure", "specificity", "ownership", "impact", "relevance"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  structure: "Structure",
  specificity: "Specificity",
  ownership: "Ownership",
  impact: "Impact",
  relevance: "Relevance",
};

export const QuestionScoreOutput = z.object({
  dimensions: z.array(
    z.object({
      dimension: z.enum(DIMENSIONS),
      score: z.number().int().describe("1 to 5, using the rubric anchors"),
      rationale: z.string().describe("One or two sentences explaining the score"),
      evidence: z
        .array(z.string())
        .describe(
          "1-2 short quotes copied word for word from the candidate's answers that justify the score. " +
            "Contiguous text only: no ellipses, no paraphrasing.",
        ),
    }),
  ),
  strengths: z.array(z.string()).describe("1-3 specific things the answer did well"),
  improvements: z.array(z.string()).describe("1-3 specific, actionable changes"),
  strongerAnswer: z
    .string()
    .describe(
      "A short outline of a stronger answer, using only facts the candidate mentioned " +
        "or placeholders like [metric] for details they'd need to supply",
    ),
});
export type QuestionScoreOutput = z.infer<typeof QuestionScoreOutput>;

export const SummaryOutput = z.object({
  headline: z.string().describe("One sentence on how the interview went overall"),
  strengths: z.array(z.string()).describe("2-3 strengths that showed up across answers"),
  priorities: z
    .array(z.string())
    .describe("The 3 most valuable things to practice before the real interview, most important first"),
});
export type SummaryOutput = z.infer<typeof SummaryOutput>;

export type DimensionScore = {
  dimension: Dimension;
  score: number;
  rationale: string;
  evidence: string[];
};

export type QuestionReport = {
  questionId: string;
  question: string;
  stage: Stage;
  competency: string;
  dimensions: DimensionScore[];
  /** Quotes the model offered that weren't in the transcript, so were dropped. */
  rejectedQuotes: number;
  strengths: string[];
  improvements: string[];
  strongerAnswer: string;
  metrics: AnswerMetrics;
};

export type ReportSummary = SummaryOutput & {
  overallScore: number;
  dimensionAverages: Record<Dimension, number>;
};

export type Report = {
  model: string;
  summary: ReportSummary;
  questions: QuestionReport[];
  metrics: AnswerMetrics;
};
