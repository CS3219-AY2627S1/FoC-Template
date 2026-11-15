// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { migrate } from "../src/migrate";

export async function createTestDatabase() {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL superuser URL");
  const name = `user_status_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.query("DO $$ BEGIN CREATE ROLE user_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
  } finally { await admin.end(); }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try { await migrate(client); }
  finally { await client.end(); }
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = "test-only-secret";
  process.env.ALLOWED_EMAIL_DOMAIN = "u.nus.edu";
  process.env.AUDIT_HMAC_KEY = "ab".repeat(32);
  process.env.BOOTSTRAP_ADMIN_USERNAME = "";
  process.env.BOOTSTRAP_ADMIN_EMAIL = "";
  process.env.BOOTSTRAP_ADMIN_PASSWORD = "";
  return {
    pool: new Pool({ connectionString: url.toString(), max: 20 }),
    async drop() {
      const cleanup = new Client({ connectionString: adminUrl });
      await cleanup.connect();
      try { await cleanup.query(`DROP DATABASE ${name} WITH (FORCE)`); }
      finally { await cleanup.end(); }
    },
  };
}

export async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
