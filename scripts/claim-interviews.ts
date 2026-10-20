// Give interviews from before accounts existed to an account:
//   npm run claim-interviews -- you@example.com
// Only interviews with no owner are moved. Plans are built for scored ones.
import { pool } from "../src/lib/db";
import { queuePlan } from "../src/lib/practice/coach";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: npm run claim-interviews -- you@example.com");

  const { rows: users } = await pool.query<{ id: string }>(`select id from "user" where email = $1`, [email]);
  if (!users[0]) throw new Error(`No account for ${email}. Sign up in the app first.`);

  const { rows } = await pool.query<{ id: string; status: string }>(
    "update sessions set user_id = $1 where user_id is null returning id, status",
    [users[0].id],
  );
  for (const s of rows.filter((s) => s.status === "scored")) await queuePlan(s.id);
  console.log(
    `Claimed ${rows.length} interviews for ${email}; queued practice plans for ${rows.filter((s) => s.status === "scored").length}.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
