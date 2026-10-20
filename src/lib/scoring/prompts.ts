import type { PlannedQuestion, Turn } from "../interview/types";
import type { AnswerMetrics } from "./metrics";
import { DIMENSION_LABELS, type QuestionReport } from "./types";

/** Anchors for the five dimensions, shared by the interview scorer and practice drills. */
export const RUBRIC = `structure: Is the answer easy to follow?
  1 = rambling, no clear point. 3 = a recognizable arc but with detours or a missing piece. 5 = a clear arc: for behavioral questions situation, action, result; for technical questions problem, approach, tradeoffs.
specificity: Is it concrete?
  1 = generalities or hypotheticals only. 3 = one real example, thin on detail. 5 = a real example with names, numbers, constraints and decisions.
ownership: Is it clear what the candidate personally did?
  1 = only "we", or their role is unclear. 3 = their role is stated but blurred with the team's. 5 = their own decisions and actions are unmistakable.
impact: Does it show results?
  1 = no outcome. 3 = an outcome without evidence or scale. 5 = a measurable or clearly significant outcome, and what they learned.
relevance: Does it answer the question and connect to this role?
  1 = off-topic. 3 = answers the question but misses what the role cares about. 5 = answers directly and shows the skills the role needs.`;

export const SCORER_SYSTEM = `You are an experienced interview coach scoring one question from a mock interview. Score what the candidate actually said, not what they might have meant. Be honest: a vague answer should score low even if the candidate is clearly capable.

Score each of the five dimensions from 1 to 5:

${RUBRIC}

Follow-up questions are part of the answer: score the candidate's answers to the question and its follow-ups together. If the interviewer had to pull a detail out with a follow-up, the original answer was missing it; reflect that in structure.

Intro and wrap-up questions aren't asking for a story. Score them against what they ask: a concise, relevant, well-chosen answer can score 4-5 without metrics or a full situation-action-result arc.

Evidence must be copied word for word from the candidate's lines in the exchange.`;

export function scoreQuestionPrompt(args: {
  question: PlannedQuestion;
  thread: Turn[];
  roleTitle: string;
}): string {
  const exchange = args.thread
    .map((t) => `${t.speaker === "candidate" ? "Candidate" : "Interviewer"}: ${t.content}`)
    .join("\n\n");
  return `<role>${args.roleTitle}</role>

<question stage="${args.question.stage}" competency="${args.question.competency}">
${args.question.text}
</question>

<why_asked>${args.question.whyAsked}</why_asked>

<look_for>
${args.question.lookFor.map((l) => `- ${l}`).join("\n")}
</look_for>

<exchange>
${exchange}
</exchange>

Score the candidate's answer.`;
}

export const SUMMARY_SYSTEM = `You are an interview coach writing the top of a mock interview scorecard. You get each question's scores and notes, plus speaking metrics. Be specific and direct: name patterns that recur across answers, and make each priority something the candidate can practice this week.`;

export function summaryPrompt(args: {
  roleTitle: string;
  questions: QuestionReport[];
  metrics: AnswerMetrics;
}): string {
  const perQuestion = args.questions
    .map((q) => {
      const scores = q.dimensions
        .map((d) => `${DIMENSION_LABELS[d.dimension]} ${d.score}/5: ${d.rationale}`)
        .join("\n  ");
      return `Q (${q.competency}): ${q.question}\n  ${scores}\n  To improve: ${q.improvements.join("; ")}`;
    })
    .join("\n\n");

  const m = args.metrics;
  return `<role>${args.roleTitle}</role>

<questions>
${perQuestion}
</questions>

<speaking_metrics>
Words: ${m.words}. Filler words: ${m.fillersPer100Words} per 100 words. "I" vs "we" share: ${m.ownershipRatio ?? "n/a"}.${
    m.wordsPerMinute != null
      ? ` Spoken answers: ${Math.round((m.talkMs ?? 0) / 1000)} seconds of talk at ${m.wordsPerMinute} words per minute.`
      : ""
  }
</speaking_metrics>

Write the scorecard summary.`;
}
