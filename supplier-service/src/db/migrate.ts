/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Generated the ESM-safe SQL migration runner and statement parser.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./pool.js";

export function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => {
      const withoutBlockComments = statement.replace(/\/\*[\s\S]*?\*\//g, "");
      const withoutLineComments = withoutBlockComments
        .split("\n")
        .map((line) => line.replace(/--.*$/, ""))
        .join("\n")
        .trim();
      return withoutLineComments.length > 0;
    });
}

async function migrate(): Promise<void> {
  const filename = resolve(dirname(fileURLToPath(import.meta.url)), "init.sql");
  const sql = await readFile(filename, "utf8");
  const statements = splitStatements(sql);

  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log(`Migration complete: ${statements.length} statements executed.`);
}

try {
  await migrate();
  await pool.end();
} catch (error) {
  console.error("Migration failed:", error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
}
