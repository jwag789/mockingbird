import { pool } from "../../db";
import { enqueue } from "../../jobs/queue";
import { SKILL_IDS, type Skill } from "../skills";
import { refreshArticles } from "./articles";
import { refreshVideos } from "./youtube";

const REFRESH_EVERY_DAYS = 7;

/**
 * Refresh videos and articles for each skill. One skill failing doesn't stop
 * the rest, but any failure throws at the end so the job retries (refreshing
 * is safe to repeat: known URLs just get their stats updated).
 */
export async function refreshResources(
  skills: Skill[] = SKILL_IDS,
  log: (msg: string) => void = console.log,
): Promise<void> {
  if (!process.env.YOUTUBE_API_KEY) log("YOUTUBE_API_KEY is not set: skipping videos, finding articles only.");
  const failed: Skill[] = [];
  for (const skill of skills) {
    const [videos, articles] = await Promise.allSettled([refreshVideos(skill), refreshArticles(skill)]);
    log(`${skill}: ${describe(videos, "videos")}, ${describe(articles, "articles")}`);
    if (videos.status === "rejected" || articles.status === "rejected") failed.push(skill);
  }
  if (failed.length) throw new Error(`Refresh failed for ${failed.length} of ${skills.length} skills: ${failed.join(", ")}`);
}

function describe(result: PromiseSettledResult<number>, what: string): string {
  return result.status === "fulfilled" ? `${result.value} ${what}` : `${what} failed (${String(result.reason)})`;
}

/**
 * Queue a weekly refresh unless one is queued, running, or succeeded this
 * week. A failed refresh doesn't count, so the next hourly check retries it.
 */
export async function scheduleResourceRefresh(): Promise<boolean> {
  const { rows } = await pool.query<{ recent: boolean }>(
    `select exists (
       select 1 from jobs
        where type = 'refresh-resources'
          and (status in ('queued', 'running') or (status = 'done' and created_at > now() - make_interval(days => $1)))
     ) as recent`,
    [REFRESH_EVERY_DAYS],
  );
  if (rows[0].recent) return false;
  await enqueue(pool, "refresh-resources", {});
  return true;
}
