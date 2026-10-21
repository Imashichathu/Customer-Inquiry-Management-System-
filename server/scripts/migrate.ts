import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const migrationNamePattern = /^\d+_[a-z0-9_]+\.sql$/;
const advisoryLockId = 71824061;

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => migrationNamePattern.test(file))
      .sort();
    const applied = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations",
    );
    const appliedNames = new Set(applied.rows.map((row) => row.name));

    for (const file of files) {
      if (appliedNames.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    if (files.length === appliedNames.size) {
      console.log("Database schema is up to date");
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

migrate().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
