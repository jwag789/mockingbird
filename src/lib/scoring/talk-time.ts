import { pool } from "../db";

/** Attach a talk time to the candidate's latest turn with this exact answer. */
export async function recordTalkTime(sessionId: string, answer: string, talkMs: number): Promise<void> {
  await pool.query(
    `insert into answer_audio (session_id, seq, talk_ms)
     select session_id, seq, $3 from turns
      where session_id = $1 and speaker = 'candidate' and content = $2
      order by seq desc limit 1
     on conflict do nothing`,
    [sessionId, answer, talkMs],
  );
}

/** Talk time in ms for each spoken answer, keyed by turn seq. Typed answers have none. */
export async function getTalkTimes(sessionId: string): Promise<Map<number, number>> {
  const { rows } = await pool.query<{ seq: number; talk_ms: number }>(
    "select seq, talk_ms from answer_audio where session_id = $1",
    [sessionId],
  );
  return new Map(rows.map((r) => [r.seq, r.talk_ms]));
}
