// Background worker: runs scoring, practice-plan and resource-refresh jobs
// from the Postgres queue.
// Wakes on NOTIFY when a job is enqueued, and polls as a fallback.
import { Client } from "pg";
import { pool } from "../lib/db";
import { JOBS_CHANNEL, claimNext, complete, fail, requeueStale, type Job } from "../lib/jobs/queue";
import { buildPlan, queuePlan } from "../lib/practice/coach";
import { refreshResources, scheduleResourceRefresh } from "../lib/practice/resources/refresh";
import { scoreSession } from "../lib/scoring/score";

const POLL_MS = 5_000;
const SCHEDULE_EVERY_MS = 60 * 60_000;

const handlers: Record<Job["type"], (job: Job) => Promise<void>> = {
  "score-session": async (job) => {
    const { sessionId } = job.payload as { sessionId: string };
    const report = await scoreSession(sessionId);
    log(`scored session ${sessionId}: ${report.summary.overallScore}/5`);
    // The scorecard is saved; a problem queuing the plan mustn't re-run scoring.
    await queuePlan(sessionId).catch((err) => log(`couldn't queue plan for ${sessionId}: ${err.message}`));
  },
  "build-plan": async (job) => {
    const { sessionId } = job.payload as { sessionId: string };
    const count = await buildPlan(sessionId);
    log(`built practice plan for ${sessionId}: ${count} tasks`);
  },
  "refresh-resources": async () => {
    await refreshResources(undefined, (msg) => log(`resources: ${msg}`));
  },
};

const onFinalFailure: Partial<Record<Job["type"], (job: Job) => Promise<void>>> = {
  "score-session": async (job) => {
    const { sessionId } = job.payload as { sessionId: string };
    await pool.query("update sessions set status = 'failed' where id = $1", [sessionId]);
  },
  "build-plan": async (job) => {
    const { sessionId } = job.payload as { sessionId: string };
    await pool.query("update practice_plans set status = 'failed' where session_id = $1", [sessionId]);
  },
};

let stopping = false;
let wake: (() => void) | null = null;

// Jobs that take minutes run alongside the queue instead of blocking it, so
// a resource refresh never holds up someone waiting for their scorecard.
const RUNS_IN_BACKGROUND = new Set<Job["type"]>(["refresh-resources"]);

async function drain() {
  for (let job = await claimNext(pool); job && !stopping; job = await claimNext(pool)) {
    if (RUNS_IN_BACKGROUND.has(job.type)) void run(job);
    else await run(job);
  }
}

async function run(job: Job) {
  const started = Date.now();
  log(`job ${job.id} (${job.type}) attempt ${job.attempts}/${job.max_attempts}`);
  try {
    await handlers[job.type](job);
    await complete(pool, job);
    log(`job ${job.id} done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    const final = await fail(pool, job, err);
    log(`job ${job.id} failed${final ? " for good" : ", will retry"}: ${(err as Error).message}`);
    if (final) await onFinalFailure[job.type]?.(job);
  }
}

async function main() {
  const listener = new Client({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  await listener.query(`listen ${JOBS_CHANNEL}`);
  listener.on("notification", () => wake?.());

  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    log("shutting down after the current job...");
    wake?.();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log("worker started");
  let lastSchedule = 0;
  while (!stopping) {
    if (Date.now() - lastSchedule > SCHEDULE_EVERY_MS) {
      lastSchedule = Date.now();
      if (await scheduleResourceRefresh()) log("queued the weekly resource refresh");
    }
    const requeued = await requeueStale(pool);
    if (requeued) log(`requeued ${requeued} stale job(s)`);
    await drain();
    if (stopping) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_MS);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    wake = null;
  }

  await listener.end();
  await pool.end();
}

function log(message: string) {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
