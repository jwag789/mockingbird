import { ClaudeOutputError, MODEL, structured } from "../claude";
import { pool } from "../db";
import { getSession } from "../interview/conductor";
import type { PlannedQuestion, Turn } from "../interview/types";
import { verifyQuotes } from "./evidence";
import { answerMetrics, combineMetrics } from "./metrics";
import { SCORER_SYSTEM, SUMMARY_SYSTEM, scoreQuestionPrompt, summaryPrompt } from "./prompts";
import { getTalkTimes } from "./talk-time";
import {
  DIMENSIONS,
  QuestionScoreOutput,
  SummaryOutput,
  type Dimension,
  type DimensionScore,
  type QuestionReport,
  type Report,
} from "./types";

/** Score a finished session and save the report. Safe to re-run: it overwrites. */
export async function scoreSession(sessionId: string): Promise<Report> {
  const { session, turns } = await getSession(sessionId);
  await pool.query("update sessions set status = 'scoring' where id = $1", [sessionId]);

  // Only questions the candidate actually answered get scored.
  const answered = session.plan.questions
    .map((question) => ({ question, thread: turns.filter((t) => t.questionId === question.id) }))
    .filter(({ thread }) => thread.some((t) => t.speaker === "candidate"));

  const judged = await Promise.all(
    answered.map(({ question, thread }) => scoreQuestion(question, thread, session.roleTitle)),
  );
  // Read talk times after the slow scoring calls: the voice server saves the
  // final answer's just after that answer ends the interview.
  const talkTimes = await getTalkTimes(sessionId);
  const questions: QuestionReport[] = judged.map((q, i) => ({
    ...q,
    metrics: threadMetrics(answered[i].thread, talkTimes),
  }));

  const metrics = combineMetrics(questions.map((q) => q.metrics));
  const dimensionAverages = averageByDimension(questions);
  const scored = Object.values(dimensionAverages).filter((v) => v > 0);
  const overallScore = scored.length ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : 0;

  const summary = questions.length
    ? await structured({
        schema: SummaryOutput,
        system: SUMMARY_SYSTEM,
        effort: "medium",
        messages: [
          { role: "user", content: summaryPrompt({ roleTitle: session.roleTitle, questions, metrics }) },
        ],
      })
    : {
        headline: "The interview ended before any questions were answered.",
        strengths: [],
        priorities: [],
      };

  const report: Report = {
    model: MODEL,
    summary: { ...summary, overallScore, dimensionAverages },
    questions,
    metrics,
  };

  await pool.query(
    `insert into reports (session_id, model, summary, questions, metrics)
     values ($1, $2, $3, $4, $5)
     on conflict (session_id) do update
       set model = excluded.model, summary = excluded.summary,
           questions = excluded.questions, metrics = excluded.metrics, created_at = now()`,
    [
      sessionId,
      report.model,
      report.summary,
      JSON.stringify(report.questions),
      report.metrics,
    ],
  );
  await pool.query("update sessions set status = 'scored' where id = $1", [sessionId]);
  return report;
}

export async function scoreQuestion(
  question: PlannedQuestion,
  thread: Turn[],
  roleTitle: string,
): Promise<Omit<QuestionReport, "metrics">> {
  const candidateText = thread
    .filter((t) => t.speaker === "candidate")
    .map((t) => t.content)
    .join("\n\n");

  const raw = await structured({
    schema: QuestionScoreOutput,
    system: SCORER_SYSTEM,
    effort: "high",
    messages: [{ role: "user", content: scoreQuestionPrompt({ question, thread, roleTitle }) }],
  });

  let rejectedQuotes = 0;
  const dimensions: DimensionScore[] = DIMENSIONS.map((dimension) => {
    const d = raw.dimensions.find((x) => x.dimension === dimension);
    if (!d) throw new ClaudeOutputError(`Scorer skipped the "${dimension}" dimension`);
    const { verified, rejected } = verifyQuotes(d.evidence, candidateText);
    rejectedQuotes += rejected.length;
    return {
      dimension,
      score: Math.min(5, Math.max(1, Math.round(d.score))),
      rationale: d.rationale,
      evidence: verified,
    };
  });

  return {
    questionId: question.id,
    question: question.text,
    stage: question.stage,
    competency: question.competency,
    dimensions,
    rejectedQuotes,
    strengths: raw.strengths,
    improvements: raw.improvements,
    strongerAnswer: raw.strongerAnswer,
  };
}

/** Counted per answer, so a question answered partly by voice and partly typed gets pace from the spoken part. */
export function threadMetrics(thread: Turn[], talkTimes: Map<number, number>) {
  return combineMetrics(
    thread
      .filter((t) => t.speaker === "candidate")
      .map((t) => {
        const talkMs = talkTimes.get(t.seq);
        return answerMetrics(t.content, talkMs == null ? undefined : { talkMs });
      }),
  );
}

function averageByDimension(questions: QuestionReport[]): Record<Dimension, number> {
  // The intro and wrap-up aren't meant to be STAR stories; leave them out of the averages.
  const core = questions.filter((q) => q.stage === "behavioral" || q.stage === "technical");
  const subset = core.length ? core : questions;
  return Object.fromEntries(
    DIMENSIONS.map((dim) => {
      const scores = subset.map((q) => q.dimensions.find((d) => d.dimension === dim)!.score);
      return [dim, scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : 0];
    }),
  ) as Record<Dimension, number>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
