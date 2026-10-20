import { readFileSync } from "node:fs";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/lib/auth";
import { pool } from "../src/lib/db";

async function main() {
  // Better Auth's tables first: the app schema references "user".
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  await pool.query(readFileSync("db/schema.sql", "utf8"));
  console.log("Schema applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
