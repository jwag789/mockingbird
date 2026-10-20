// Refresh the practice resource library now, instead of waiting for the
// worker's weekly run. Optionally pass skill ids: npm run resources:refresh -- system-design
import { pool } from "../src/lib/db";
import { refreshResources } from "../src/lib/practice/resources/refresh";
import { SKILL_IDS, type Skill } from "../src/lib/practice/skills";

async function main() {
  const asked = process.argv.slice(2);
  const unknown = asked.filter((s) => !SKILL_IDS.includes(s as Skill));
  if (unknown.length) throw new Error(`Unknown skills: ${unknown.join(", ")}. Known: ${SKILL_IDS.join(", ")}`);
  await refreshResources(asked.length ? (asked as Skill[]) : undefined);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
