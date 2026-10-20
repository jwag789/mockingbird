import { pool, withTransaction } from "../db";
import { NotFoundError } from "../interview/conductor";
import type { Dimension } from "../scoring/types";
import type { Skill } from "./skills";

export type TaskKind = "watch" | "read" | "drill" | "challenge";

export type TaskView = {
  id: number;
  sessionId: string;
  kind: TaskKind;
  skill: Skill;
  title: string;
  why: string;
  evidence: { questionId: string; question: string; dimension: Dimension | null; score: number | null; quote: string } | null;
  resource: {
    kind: "video" | "article";
    title: string;
    url: string;
    source: string;
    summary: string;
    durationS: number | null;
    publishedAt: string | null;
  } | null;
  prompt: string | null;
  dimension: Dimension | null;
  baseline: number | null;
  status: "todo" | "done";
  rating: -1 | 1 | null;
  attempts: number;
  best: number | null;
  lastAttempt: AttemptView | null;
};

export type AttemptView = {
  score: number;
  baseline: number | null;
  feedback: { rationale: string; quotes: string[]; nextStep: string; strengths?: string[]; gaps?: string[] };
  createdAt: string;
};

export type PlanView = {
  sessionId: string;
  roleTitle: string;
  createdAt: string;
  status: "building" | "ready" | "failed";
  focus: string | null;
  tasks: TaskView[];
};

const TASK_SELECT = `
  select t.id, t.session_id, t.kind, t.skill, t.title, t.why, t.evidence, t.prompt, t.dimension,
         t.baseline, t.status, t.rating,
         r.kind as r_kind, r.title as r_title, r.url as r_url, r.source as r_source,
         r.summary as r_summary, r.duration_s as r_duration_s, r.published_at as r_published_at,
         (select count(*) from practice_attempts a where a.task_id = t.id)::int as attempts,
         (select max(score) from practice_attempts a where a.task_id = t.id) as best,
         (select row_to_json(a) from (
            select score, feedback, created_at from practice_attempts a
             where a.task_id = t.id order by created_at desc limit 1
          ) a) as last_attempt
    from practice_tasks t
    left join resources r on r.id = t.resource_id`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTask(r: any): TaskView {
  return {
    id: Number(r.id),
    sessionId: r.session_id,
    kind: r.kind,
    skill: r.skill,
    title: r.title,
    why: r.why,
    evidence: r.evidence,
    resource: r.r_url
      ? {
          kind: r.r_kind,
          title: r.r_title,
          url: r.r_url,
          source: r.r_source,
          summary: r.r_summary,
          durationS: r.r_duration_s,
          publishedAt: r.r_published_at?.toISOString() ?? null,
        }
      : null,
    prompt: r.prompt,
    dimension: r.dimension,
    baseline: r.baseline,
    status: r.status,
    rating: r.rating,
    attempts: r.attempts,
    best: r.best,
    lastAttempt: r.last_attempt
      ? {
          score: r.last_attempt.score,
          baseline: r.baseline,
          feedback: r.last_attempt.feedback,
          createdAt: r.last_attempt.created_at,
        }
      : null,
  };
}

/** The plan for one interview, or null if none was made (e.g. not scored yet). */
export async function getPlan(sessionId: string, userId: string): Promise<PlanView | null> {
  const plans = await listPlans(userId, { sessionId });
  return plans[0] ?? null;
}

/** The user's recent plans, newest first, with their tasks. */
export async function listPlans(userId: string, opts: { sessionId?: string; limit?: number } = {}): Promise<PlanView[]> {
  const { rows: plans } = await pool.query(
    `select p.session_id, p.status, p.focus, p.created_at, s.role_title
       from practice_plans p join sessions s on s.id = p.session_id
      where p.user_id = $1 and ($2::uuid is null or p.session_id = $2)
      order by p.created_at desc limit $3`,
    [userId, opts.sessionId ?? null, opts.limit ?? 10],
  );
  if (plans.length === 0) return [];

  const { rows: tasks } = await pool.query(
    `${TASK_SELECT} where t.user_id = $1 and t.session_id = any($2) order by t.position`,
    [userId, plans.map((p) => p.session_id)],
  );
  return plans.map((p) => ({
    sessionId: p.session_id,
    roleTitle: p.role_title,
    createdAt: p.created_at.toISOString(),
    status: p.status,
    focus: p.focus,
    tasks: tasks.filter((t) => t.session_id === p.session_id).map(toTask),
  }));
}

export async function getTask(taskId: number, userId: string): Promise<TaskView> {
  const { rows } = await pool.query(`${TASK_SELECT} where t.id = $1 and t.user_id = $2`, [taskId, userId]);
  if (!rows[0]) throw new NotFoundError("Task not found");
  return toTask(rows[0]);
}

/**
 * Mark a task done or not, and/or rate it. Ratings on resource tasks also
 * count toward that resource's ranking for everyone.
 */
export async function updateTask(
  taskId: number,
  userId: string,
  change: { status?: "todo" | "done"; rating?: -1 | 1 | null },
): Promise<void> {
  await withTransaction(async (db) => {
    const { rows } = await db.query<{ rating: -1 | 1 | null; resource_id: string | null }>(
      "select rating, resource_id from practice_tasks where id = $1 and user_id = $2 for update",
      [taskId, userId],
    );
    if (!rows[0]) throw new NotFoundError("Task not found");

    if (change.status) {
      await db.query(
        `update practice_tasks set status = $2,
                completed_at = case when $2 = 'done' then coalesce(completed_at, now()) else null end
          where id = $1`,
        [taskId, change.status],
      );
    }

    if (change.rating !== undefined && change.rating !== rows[0].rating) {
      await db.query("update practice_tasks set rating = $2 where id = $1", [taskId, change.rating]);
      if (rows[0].resource_id) {
        // Undo the old vote, apply the new one.
        const delta = (r: -1 | 1 | null, sign: number) => ({
          helpful: r === 1 ? sign : 0,
          unhelpful: r === -1 ? sign : 0,
        });
        const before = delta(rows[0].rating, -1);
        const after = delta(change.rating, 1);
        await db.query(
          "update resources set helpful = helpful + $2, unhelpful = unhelpful + $3 where id = $1",
          [rows[0].resource_id, before.helpful + after.helpful, before.unhelpful + after.unhelpful],
        );
      }
    }
  });
}
