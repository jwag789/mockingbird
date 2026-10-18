import { readFileSync } from "node:fs";
import { pool } from "../src/lib/db";

async function main() {
  await pool.query(readFileSync("db/schema.sql", "utf8"));
  console.log("Schema applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
