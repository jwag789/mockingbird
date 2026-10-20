// Live scoring progress. The worker writes it as each step finishes and
// NOTIFYs; the scorecard page streams it over SSE (see the events route).
import { pool } from "../db";
import type { Stage } from "../interview/stages";
import type { Dimension } from "./types";

export const PROGRESS_CHANNEL = "scoring_progress";

export type QuestionProgress = {
  id: string;
  question: string;
  stage: Stage;
  competency: string;
  /** The candidate's words, trimmed, so the page can show them being read. */
  excerpt: string;
  state: "scoring" | "done";
  score?: number;
  dimensions?: Partial<Record<Dimension, number>>;
  quotes?: string[];
  rejectedQuotes?: number;
};

export type ScoringProgress = {
  startedAt: string;
  phase: "questions" | "summary" | "done";
  questions: QuestionProgress[];
};

const EXCERPT_CHARS = 420;

export function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= EXCERPT_CHARS) return clean;
  return `${clean.slice(0, clean.lastIndexOf(" ", EXCERPT_CHARS))}…`;
}

export async function startProgress(sessionId: string, questions: QuestionProgress[]) {
  const progress: ScoringProgress = {
    startedAt: new Date().toISOString(),
    phase: "questions",
    questions,
  };
  await pool.query("update sessions set progress = $2 where id = $1", [sessionId, progress]);
  await notify(sessionId);
}

/** Record one finished question. jsonb_set keeps concurrent updates from clobbering each other. */
export async function finishQuestion(
  sessionId: string,
  index: number,
  result: Pick<QuestionProgress, "score" | "dimensions" | "quotes" | "rejectedQuotes">,
) {
  await pool.query(
    `update sessions
        set progress = jsonb_set(progress, $2::text[], (progress #> $2::text[]) || $3::jsonb)
      where id = $1`,
    [sessionId, ["questions", String(index)], { ...result, state: "done" }],
  );
  await notify(sessionId);
}

export async function setPhase(sessionId: string, phase: ScoringProgress["phase"]) {
  await pool.query(
    "update sessions set progress = jsonb_set(progress, '{phase}', to_jsonb($2::text)) where id = $1",
    [sessionId, phase],
  );
  await notify(sessionId);
}

async function notify(sessionId: string) {
  await pool.query("select pg_notify($1, $2)", [PROGRESS_CHANNEL, sessionId]);
}
