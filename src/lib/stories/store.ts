import { pool } from "../db";
import { NotFoundError } from "../interview/conductor";
import type { StoryView } from "./insights";

export async function listStories(userId: string): Promise<StoryView[]> {
  const { rows } = await pool.query(
    `select st.id, st.title, st.summary, st.situation, st.action, st.result, st.competencies,
            st.numbers, st.notes, st.updated_at,
            coalesce(json_agg(json_build_object(
              'sessionId', m.session_id, 'roleTitle', s.role_title, 'createdAt', m.created_at,
              'question', m.question, 'quote', m.quote, 'score', m.score, 'scores', m.scores
            ) order by m.created_at desc) filter (where m.id is not null), '[]') as mentions
       from stories st
       left join story_mentions m on m.story_id = st.id
       left join sessions s on s.id = m.session_id
      where st.user_id = $1
      group by st.id
      order by st.updated_at desc`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    summary: r.summary,
    situation: r.situation,
    action: r.action,
    result: r.result,
    competencies: r.competencies,
    numbers: r.numbers,
    notes: r.notes,
    updatedAt: r.updated_at.toISOString(),
    mentions: r.mentions,
  }));
}

export async function updateStory(id: number, userId: string, change: { title?: string; notes?: string }) {
  const { rowCount } = await pool.query(
    `update stories set title = coalesce($3, title), notes = coalesce($4, notes), updated_at = now()
      where id = $1 and user_id = $2`,
    [id, userId, change.title ?? null, change.notes ?? null],
  );
  if (!rowCount) throw new NotFoundError("Story not found");
}

export async function deleteStory(id: number, userId: string) {
  const { rowCount } = await pool.query("delete from stories where id = $1 and user_id = $2", [id, userId]);
  if (!rowCount) throw new NotFoundError("Story not found");
}
