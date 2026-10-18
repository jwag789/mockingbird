import type { Pool, PoolClient } from "pg";

export type JobType = "score-session";

export type Job = {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

export const JOBS_CHANNEL = "jobs";

/**
 * Enqueue a job. Pass the transaction's client so the job is only visible
 * if the rest of the transaction commits (no lost or orphaned jobs).
 */
export async function enqueue(
  db: Pool | PoolClient,
  type: JobType,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.query("insert into jobs (type, payload) values ($1, $2)", [type, payload]);
  // NOTIFY is delivered on commit, so workers wake only once the job exists.
  await db.query(`notify ${JOBS_CHANNEL}`);
}

/** Claim the next due job. SKIP LOCKED lets many workers poll the same table safely. */
export async function claimNext(db: Pool): Promise<Job | null> {
  const { rows } = await db.query<Job>(
    `update jobs
        set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
      where id = (
        select id from jobs
         where status = 'queued' and run_at <= now()
         order by run_at, id
         for update skip locked
         limit 1
      )
      returning id, type, payload, attempts, max_attempts`,
  );
  return rows[0] ?? null;
}

export async function complete(db: Pool, job: Job): Promise<void> {
  await db.query(
    "update jobs set status = 'done', locked_at = null, updated_at = now() where id = $1",
    [job.id],
  );
}

/** Seconds to wait before retry N: 10s, 40s, 160s... */
export function backoffSeconds(attempts: number): number {
  return 10 * 4 ** (attempts - 1);
}

/** Retry with backoff, or mark failed once attempts run out. Returns true if final. */
export async function fail(db: Pool, job: Job, error: unknown): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const final = job.attempts >= job.max_attempts;
  await db.query(
    `update jobs
        set status = $2, locked_at = null, last_error = $3, updated_at = now(),
            run_at = now() + make_interval(secs => $4)
      where id = $1`,
    [job.id, final ? "failed" : "queued", message, final ? 0 : backoffSeconds(job.attempts)],
  );
  return final;
}

/** Put back jobs whose worker died mid-run. */
export async function requeueStale(db: Pool, staleAfterSeconds = 300): Promise<number> {
  const { rowCount } = await db.query(
    `update jobs set status = 'queued', locked_at = null, updated_at = now()
      where status = 'running' and locked_at < now() - make_interval(secs => $1)`,
    [staleAfterSeconds],
  );
  return rowCount ?? 0;
}
