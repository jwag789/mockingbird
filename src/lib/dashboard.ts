// Everything the dashboard shows, in one round of queries.
import { pool } from "./db";
import { listSessions } from "./interview/conductor";
import { listPlans, type TaskView } from "./practice/store";
import { DIMENSIONS, type Dimension } from "./scoring/types";
import type { Competency } from "./stories/competencies";
import { coverage } from "./stories/insights";
import { listStories } from "./stories/store";

export type InterviewPoint = {
  id: string;
  createdAt: string;
  roleTitle: string;
  overall: number;
  dimensions: Record<Dimension, number>;
};

export type UpcomingInterview = { company: string; roleTitle: string; interviewOn: string };

export type DashboardData = {
  /** Scored interviews, oldest first, for trends. */
  history: InterviewPoint[];
  recent: Awaited<ReturnType<typeof listSessions>>;
  upNext: Array<TaskView & { roleTitle: string }>;
  openTasks: number;
  latestPlan: { sessionId: string; focus: string | null; total: number; done: number } | null;
  week: { interviews: number; tasksDone: number; drillsBeaten: number };
  /** Consecutive days, ending today or yesterday, with an interview or practice. */
  streak: number;
  upcoming: UpcomingInterview | null;
  stories: { count: number; covered: number; missing: Competency[] };
};

const HISTORY_LIMIT = 12;

export async function getDashboard(userId: string): Promise<DashboardData> {
  const [history, recent, plans, week, activity, upcoming, stories] = await Promise.all([
    pool.query(
      `select s.id, s.created_at, s.role_title,
              (r.summary->>'overallScore')::float as overall,
              r.summary->'dimensionAverages' as dims
         from sessions s join reports r on r.session_id = s.id
        where s.user_id = $1 and s.status = 'scored'
        order by s.created_at desc limit $2`,
      [userId, HISTORY_LIMIT],
    ),
    listSessions(userId, 5),
    listPlans(userId, { limit: 5 }),
    pool.query<{ interviews: number; tasks_done: number; drills_beaten: number }>(
      `select
         (select count(*) from sessions where user_id = $1 and created_at > now() - interval '7 days')::int as interviews,
         (select count(*) from practice_tasks where user_id = $1 and completed_at > now() - interval '7 days')::int as tasks_done,
         (select count(distinct a.task_id) from practice_attempts a
            join practice_tasks t on t.id = a.task_id
           where a.user_id = $1 and a.created_at > now() - interval '7 days'
             and t.baseline is not null and a.score > t.baseline)::int as drills_beaten`,
      [userId],
    ),
    pool.query<{ day: string }>(
      `select distinct to_char(at, 'YYYY-MM-DD') as day from (
         select created_at as at from sessions where user_id = $1
         union all select completed_at from practice_tasks where user_id = $1 and completed_at is not null
         union all select created_at from practice_attempts where user_id = $1
       ) a where at > now() - interval '60 days'`,
      [userId],
    ),
    pool.query<{ company: string; role_title: string; interview_on: string }>(
      "select company, role_title, to_char(interview_on, 'YYYY-MM-DD') as interview_on from upcoming_interviews where user_id = $1",
      [userId],
    ),
    listStories(userId),
  ]);
  const storyCoverage = coverage(stories);

  const ready = plans.filter((p) => p.status === "ready");
  const open = ready.flatMap((p) => p.tasks.filter((t) => t.status === "todo").map((t) => ({ ...t, roleTitle: p.roleTitle })));
  const latest = ready[0];

  return {
    history: history.rows
      .map((r) => ({
        id: r.id,
        createdAt: r.created_at.toISOString(),
        roleTitle: r.role_title,
        overall: r.overall,
        dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, Number(r.dims?.[d] ?? 0)])) as Record<Dimension, number>,
      }))
      .reverse(),
    recent,
    upNext: open.slice(0, 3),
    openTasks: open.length,
    latestPlan: latest
      ? {
          sessionId: latest.sessionId,
          focus: latest.focus,
          total: latest.tasks.length,
          done: latest.tasks.filter((t) => t.status === "done").length,
        }
      : null,
    week: {
      interviews: week.rows[0].interviews,
      tasksDone: week.rows[0].tasks_done,
      drillsBeaten: week.rows[0].drills_beaten,
    },
    streak: streak(new Set(activity.rows.map((r) => r.day))),
    upcoming: upcoming.rows[0]
      ? { company: upcoming.rows[0].company, roleTitle: upcoming.rows[0].role_title, interviewOn: upcoming.rows[0].interview_on }
      : null,
    stories: {
      count: stories.length,
      covered: storyCoverage.filter((c) => c.story).length,
      missing: storyCoverage.filter((c) => !c.story).map((c) => c.competency),
    },
  };
}

/** Days in a row with activity, counting back from today (or yesterday, so a streak survives until tonight). */
export function streak(days: Set<string>, today = new Date()): number {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!days.has(key(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (days.has(key(cursor))) {
    count++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return count;
}

export async function setUpcoming(userId: string, u: UpcomingInterview): Promise<void> {
  await pool.query(
    `insert into upcoming_interviews (user_id, company, role_title, interview_on)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update
       set company = excluded.company, role_title = excluded.role_title,
           interview_on = excluded.interview_on, updated_at = now()`,
    [userId, u.company, u.roleTitle, u.interviewOn],
  );
}

export async function clearUpcoming(userId: string): Promise<void> {
  await pool.query("delete from upcoming_interviews where user_id = $1", [userId]);
}
