// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-11-07
// Scope: Add opt-in SSL support for PostgreSQL connections to AWS RDS.
// Author review: Verified. It was only a 3 line change.

import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  ssl: process.env.DB_SSL === "true"
    ? { rejectUnauthorized: false } 
    : false,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle database client", err);
  process.exit(-1);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);

export default pool;