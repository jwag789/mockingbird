import { z } from "zod";
import { STAGES } from "./stages";

export { STAGES, STAGE_LABELS, type Stage } from "./stages";

/** What Claude returns when it plans an interview from a resume and job description. */
export const PlanOutput = z.object({
  roleTitle: z.string().describe("The job title, as written in the job description"),
  candidateSummary: z
    .string()
    .describe("2-3 sentences on the candidate's background, from the resume"),
  focusAreas: z
    .array(
      z.object({
        requirement: z.string().describe("A requirement from the job description"),
        resumeEvidence: z
          .string()
          .describe("What on the resume shows this; empty string if nothing does"),
        isGap: z.boolean(),
      }),
    )
    .describe("The 4-6 most important requirements of the role"),
  questions: z.array(
    z.object({
      stage: z.enum(STAGES),
      text: z.string().describe("The question, worded as the interviewer would say it aloud"),
      whyAsked: z
        .string()
        .describe("Which requirement or resume claim this probes, in one sentence"),
      competency: z.string().describe("Short label, e.g. 'Ownership' or 'System design'"),
      lookFor: z.array(z.string()).describe("2-4 things a strong answer would include"),
    }),
  ),
});
export type PlanOutput = z.infer<typeof PlanOutput>;

export type PlannedQuestion = PlanOutput["questions"][number] & { id: string };
export type InterviewPlan = Omit<PlanOutput, "questions"> & {
  questions: PlannedQuestion[];
};

export type InterviewState = {
  questionIndex: number;
  followUpsUsed: number;
  clarificationsUsed: number;
  startedAt: string;
  finished: boolean;
};

/** Claude's read of the candidate's latest answer. Code decides what happens next. */
export const TurnJudgment = z.object({
  assessment: z
    .string()
    .describe("Private note, 1-2 sentences: what the answer covered and what it missed"),
  intent: z
    .enum(["follow_up", "move_on", "clarify", "stop"])
    .describe(
      "follow_up: the answer needs probing. move_on: the answer is complete enough. " +
        "clarify: the candidate asked a question instead of answering. " +
        "stop: the candidate asked to end the interview.",
    ),
  message: z
    .string()
    .describe(
      "follow_up: the follow-up question. clarify: your answer to their question, " +
        "ending by inviting them to answer. move_on: a brief neutral acknowledgement " +
        "under 12 words that asks nothing. stop: a brief, kind closing line.",
    ),
});
export type TurnJudgment = z.infer<typeof TurnJudgment>;

export type TurnKind = "question" | "follow_up" | "clarification" | "answer" | "closing";

export type Turn = {
  seq: number;
  speaker: "interviewer" | "candidate";
  questionId: string | null;
  kind: TurnKind;
  content: string;
};
