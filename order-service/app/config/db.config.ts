// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-11-07
// Scope: Added an environment-controlled PostgreSQL SSL setting for deployment.
// Author review: Reviewed manually and tested on deployment. The change was only 1 line.

import { required } from "./env.ts";

export default {
  HOST: process.env.DB_HOST || "localhost",
  PORT: Number(process.env.DB_PORT) || 5432,
  USER: required("DB_USER"),
  PASSWORD: required("DB_PASSWORD"),
  DB: required("DB_DATABASE"),
  SSL: process.env.DB_SSL === "true",
  dialect: "postgres" as const,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};
