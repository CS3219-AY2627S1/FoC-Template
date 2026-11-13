// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-11-07
// Scope: Add opt-in SSL support for PostgreSQL connections to AWS RDS.
// Author review: Verified. It was only a 3 line change.

import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

export const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: false } 
    : false,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

export const query = (text: string, params?: unknown[]) => {
  return pool.query(text, params);
};