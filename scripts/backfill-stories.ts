// Queue story extraction for interviews scored before the story bank existed,
// oldest first so repeated stories merge in order. The worker does the work.
//   npm run stories:backfill                     # everyone
//   npm run stories:backfill -- you@example.com  # one account
import { pool } from "../src/lib/db";
import { enqueue } from "../src/lib/jobs/queue";

async function main() {
  const email = process.argv[2] ?? null;
  const { rows } = await pool.query<{ id: string }>(
    `select s.id from sessions s join "user" u on u.id = s.user_id
      where s.status = 'scored' and ($1::text is null or u.email = $1)
        and not exists (select 1 from story_mentions m where m.session_id = s.id)
      order by s.created_at`,
    [email],
  );
  for (const r of rows) await enqueue(pool, "extract-stories", { sessionId: r.id });
  console.log(`Queued story extraction for ${rows.length} interviews.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
