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

export type ClipWord = { w: string; s: number; e: number };

/** Attach a playback clip to the candidate's latest turn with this exact answer. */
export async function recordAnswerAudio(
  sessionId: string,
  answer: string,
  clip: { audio: Buffer; mime: string; durationMs: number; words: ClipWord[] },
): Promise<void> {
  await pool.query(
    `update answer_audio a set audio = $3, mime = $4, duration_ms = $5, words = $6
       from (select seq from turns
              where session_id = $1 and speaker = 'candidate' and content = $2
              order by seq desc limit 1) t
      where a.session_id = $1 and a.seq = t.seq`,
    [sessionId, answer, clip.audio, clip.mime, clip.durationMs, JSON.stringify(clip.words)],
  );
}

/** Word timings and length for each answer that has a playback clip, keyed by turn seq. */
export async function getAnswerClips(sessionId: string): Promise<Record<number, { durationMs: number; words: ClipWord[] }>> {
  const { rows } = await pool.query<{ seq: number; duration_ms: number; words: ClipWord[] }>(
    "select seq, duration_ms, words from answer_audio where session_id = $1 and audio is not null",
    [sessionId],
  );
  return Object.fromEntries(rows.map((r) => [r.seq, { durationMs: r.duration_ms, words: r.words }]));
}

/** The MP3 for one answer, or null. */
export async function getAnswerAudio(sessionId: string, seq: number): Promise<{ audio: Buffer; mime: string } | null> {
  const { rows } = await pool.query<{ audio: Buffer; mime: string }>(
    "select audio, mime from answer_audio where session_id = $1 and seq = $2 and audio is not null",
    [sessionId, seq],
  );
  return rows[0] ?? null;
}
