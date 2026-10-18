import type { PoolClient } from "pg";
import { structured } from "../claude";
import { pool, withTransaction } from "../db";
import { enqueue } from "../jobs/queue";
import { CLOSING_LINE, initialState, nextStep, stageTransition } from "./engine";
import { generatePlan, type ResumeInput } from "./plan";
import { interviewerSystemPrompt, judgeTurnPrompt } from "./prompts";
import {
  TurnJudgment,
  type InterviewPlan,
  type InterviewState,
  type Turn,
  type TurnKind,
} from "./types";

export type SessionStatus = "active" | "ended" | "scoring" | "scored" | "failed";

export type Session = {
  id: string;
  createdAt: string;
  status: SessionStatus;
  roleTitle: string;
  jobDescription: string;
  targetMinutes: number;
  plan: InterviewPlan;
  state: InterviewState;
  endedAt: string | null;
};

export class NotFoundError extends Error {}
/** The session changed under us (e.g. a double submit). The client should refetch. */
export class ConflictError extends Error {}

export async function startSession(args: {
  resume: ResumeInput;
  jobDescription: string;
  targetMinutes: number;
}): Promise<string> {
  const plan = await generatePlan(args);
  const state = initialState(new Date());
  const first = plan.questions[0];
  const opening =
    `Hi, thanks for making the time. I'll be interviewing you for the ${plan.roleTitle} role, ` +
    `and we have about ${args.targetMinutes} minutes.\n\n${first.text}`;

  return withTransaction(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `insert into sessions (role_title, job_description, target_minutes, plan, state)
       values ($1, $2, $3, $4, $5) returning id`,
      [plan.roleTitle, args.jobDescription, args.targetMinutes, plan, state],
    );
    const id = rows[0].id;
    await insertTurn(db, id, 0, "interviewer", first.id, "question", opening);
    return id;
  });
}

export async function getSession(id: string): Promise<{ session: Session; turns: Turn[] }> {
  const { rows } = await pool.query(
    `select id, created_at, status, role_title, job_description, target_minutes, plan, state, ended_at
       from sessions where id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError(`No session ${id}`);
  const r = rows[0];
  const session: Session = {
    id: r.id,
    createdAt: r.created_at.toISOString(),
    status: r.status,
    roleTitle: r.role_title,
    jobDescription: r.job_description,
    targetMinutes: r.target_minutes,
    plan: r.plan,
    state: r.state,
    endedAt: r.ended_at?.toISOString() ?? null,
  };
  return { session, turns: await getTurns(id) };
}

export async function getTurns(sessionId: string): Promise<Turn[]> {
  const { rows } = await pool.query(
    `select seq, speaker, question_id, kind, content from turns
      where session_id = $1 order by seq`,
    [sessionId],
  );
  return rows.map((r) => ({
    seq: r.seq,
    speaker: r.speaker,
    questionId: r.question_id,
    kind: r.kind,
    content: r.content,
  }));
}

/**
 * Take the candidate's answer, have Claude judge it, let the engine pick the
 * next step, and save both turns. Claude runs outside the transaction; the
 * write then checks nobody else advanced the session in the meantime.
 */
export async function submitAnswer(sessionId: string, answer: string): Promise<void> {
  const { session, turns } = await getSession(sessionId);
  if (session.status !== "active") throw new ConflictError("This interview has ended.");

  const { plan, state } = session;
  const question = plan.questions[state.questionIndex];
  const lastSeq = turns.at(-1)?.seq ?? -1;
  const answerTurn: Turn = {
    seq: lastSeq + 1,
    speaker: "candidate",
    questionId: question.id,
    kind: "answer",
    content: answer,
  };
  const thread = [...turns.filter((t) => t.questionId === question.id), answerTurn];

  const now = new Date();
  const elapsedMinutes = (now.getTime() - new Date(state.startedAt).getTime()) / 60_000;
  const judgment = await structured({
    schema: TurnJudgment,
    system: interviewerSystemPrompt(plan, session.jobDescription),
    effort: "low",
    messages: [
      {
        role: "user",
        content: judgeTurnPrompt({
          question,
          thread,
          state,
          elapsedMinutes,
          targetMinutes: session.targetMinutes,
        }),
      },
    ],
  });

  const step = nextStep({ plan, state, judgment, targetMinutes: session.targetMinutes, now });

  let reply: { kind: TurnKind; questionId: string; content: string };
  switch (step.action) {
    case "follow_up":
      reply = { kind: "follow_up", questionId: question.id, content: judgment.message };
      break;
    case "clarify":
      reply = { kind: "clarification", questionId: question.id, content: judgment.message };
      break;
    case "advance": {
      // Only a move_on judgment produces a neutral acknowledgement; anything
      // else (e.g. a follow-up the engine overruled) would be the wrong line.
      const ack = judgment.intent === "move_on" ? judgment.message : null;
      const lead = [ack, stageTransition(step.from.stage, step.to.stage)].filter(Boolean).join(" ");
      reply = {
        kind: "question",
        questionId: step.to.id,
        content: lead ? `${lead}\n\n${step.to.text}` : step.to.text,
      };
      break;
    }
    case "finish": {
      const parting =
        judgment.intent === "clarify" || judgment.intent === "stop" ? judgment.message : null;
      reply = {
        kind: "closing",
        questionId: question.id,
        content: parting ? `${parting}\n\n${CLOSING_LINE}` : CLOSING_LINE,
      };
      break;
    }
  }

  await withTransaction(async (db) => {
    const { rows } = await db.query<{ status: string; last_seq: number | null }>(
      `select s.status, (select max(seq) from turns where session_id = s.id) as last_seq
         from sessions s where s.id = $1 for update`,
      [sessionId],
    );
    if (rows[0].status !== "active" || (rows[0].last_seq ?? -1) !== lastSeq) {
      throw new ConflictError("The interview moved on while this answer was being processed.");
    }

    await insertTurn(db, sessionId, answerTurn.seq, "candidate", question.id, "answer", answer);
    await insertTurn(db, sessionId, answerTurn.seq + 1, "interviewer", reply.questionId, reply.kind, reply.content);

    if (step.action === "finish") {
      await markEnded(db, sessionId, step.state);
    } else {
      await db.query("update sessions set state = $2 where id = $1", [sessionId, step.state]);
    }
  });
}

/** End early at the candidate's request. Safe to call twice. */
export async function endSession(sessionId: string): Promise<void> {
  await withTransaction(async (db) => {
    const { rows } = await db.query<{ status: string; state: InterviewState }>(
      "select status, state from sessions where id = $1 for update",
      [sessionId],
    );
    if (!rows[0]) throw new NotFoundError(`No session ${sessionId}`);
    if (rows[0].status !== "active") return;
    await markEnded(db, sessionId, { ...rows[0].state, finished: true });
  });
}

async function markEnded(db: PoolClient, sessionId: string, state: InterviewState) {
  await db.query(
    "update sessions set status = 'ended', ended_at = now(), state = $2 where id = $1",
    [sessionId, state],
  );
  // Same transaction: the scoring job exists if and only if the session ended.
  await enqueue(db, "score-session", { sessionId });
}

async function insertTurn(
  db: PoolClient,
  sessionId: string,
  seq: number,
  speaker: Turn["speaker"],
  questionId: string | null,
  kind: TurnKind,
  content: string,
) {
  await db.query(
    `insert into turns (session_id, seq, speaker, question_id, kind, content)
     values ($1, $2, $3, $4, $5, $6)`,
    [sessionId, seq, speaker, questionId, kind, content],
  );
}

export async function listSessions(limit = 20) {
  const { rows } = await pool.query<{
    id: string;
    created_at: Date;
    status: SessionStatus;
    role_title: string;
    overall: number | null;
  }>(
    `select s.id, s.created_at, s.status, s.role_title,
            (r.summary->>'overallScore')::float as overall
       from sessions s left join reports r on r.session_id = s.id
      order by s.created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    status: r.status,
    roleTitle: r.role_title,
    overallScore: r.overall,
  }));
}
