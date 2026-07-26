#!/usr/bin/env node
/**
 * Apply provider-api SQL migrations in filename order, exactly once each.
 *
 * Idempotent: a ledger table records what has run, so re-running is a no-op and
 * a half-set-up database can be brought forward without dropping it. That matters
 * on demo day, where the failure mode to avoid is "did I already run this?".
 *
 *   pnpm db:migrate                     # from the repo root
 *   DATABASE_URL=postgres://… node apps/provider-api/scripts/migrate.mjs
 *
 * Lives inside apps/provider-api so that `pg` resolves — pnpm does not hoist
 * workspace dependencies to the root node_modules.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(packageRoot, "drizzle");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set.\n" +
      "  Local default: postgres://casium:casium@localhost:5432/casium\n" +
      "  Start Postgres first with: pnpm db:up",
  );
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No .sql files found in ${migrationsDir}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
} catch (err) {
  console.error(`Could not connect to Postgres at ${redact(databaseUrl)}`);
  console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  console.error("  Is it running? Try: pnpm db:up");
  process.exit(1);
}

await client.query(`
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`);

const { rows } = await client.query("select name from schema_migrations");
const applied = new Set(rows.map((row) => row.name));

let ran = 0;
for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip   ${file} (already applied)`);
    continue;
  }

  const sql = readFileSync(resolve(migrationsDir, file), "utf8");

  // One transaction per file: a failure leaves the ledger and the schema in step.
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`  applied ${file}`);
    ran += 1;
  } catch (err) {
    await client.query("rollback");
    console.error(`\nMigration failed: ${file}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(ran === 0 ? "\nDatabase already up to date." : `\nApplied ${ran} migration(s).`);

function redact(url) {
  return url.replace(/\/\/[^@]*@/, "//***@");
}
