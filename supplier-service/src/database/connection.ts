/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: centralized creation and cleanup of Supplier PostgreSQL/Drizzle connections.
 * Author review: Reviewed and approved by @ron.
 */
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export interface DatabaseConnection {
  pool: Pool;
  database: NodePgDatabase<typeof schema>;
}

export function createDatabaseConnection(databaseUrl: string): DatabaseConnection {
  const pool = new Pool({ connectionString: databaseUrl });
  return {
    pool,
    database: drizzle(pool, { schema }),
  };
}

export async function withDatabaseConnection<T>(
  databaseUrl: string,
  operation: (connection: DatabaseConnection) => Promise<T>,
): Promise<T> {
  const connection = createDatabaseConnection(databaseUrl);
  try {
    return await operation(connection);
  } finally {
    await connection.pool.end();
  }
}
