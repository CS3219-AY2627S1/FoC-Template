// Seed verified users and credit balances for the k6 run.
//
//   node load-test/setup/seed-users.mjs
//   node load-test/setup/seed-users.mjs --apply
//
// VUS sizes the roster (k8s load-setup sets 60000; local default 9600).
// Everyone can request and deliver in k6 (REQUEST_PROBABILITY); seed still
// builds two label lists for stable ids. k6 may run with fewer VUs than seeded.
// CREDIT_BALANCE (default 5000) for every user — each order spends 1.
// Local --apply pipes SQL into Docker Postgres. Against EKS, generate the files
// here, then apply users.sql and credits.sql to the User and Credit databases.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { positiveInt, rosterFromEnv } from "./roster.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const balance = positiveInt(process.env.CREDIT_BALANCE, 5000);
const apply = process.argv.includes("--apply");
const { total, share, requesters, couriers } = rosterFromEnv();
const allUsers = [...requesters, ...couriers];
for (const row of allUsers) {
  row.id = uuid(`${row.role}-${row.email}`);
}

mkdirSync(root, { recursive: true });
writeFileSync(
  join(root, "users.json"),
  JSON.stringify({
    vus: total,
    requestProbability: share,
    users: allUsers,
    // Kept for older tooling; k6 prefers `users`.
    requesterShare: share,
    requesters,
    couriers,
  }),
);
const userSql = join(root, "users.sql");
const creditSql = join(root, "credits.sql");
writeFileSync(userSql, userInserts(allUsers));
writeFileSync(creditSql, creditInserts(allUsers, balance));

console.log(`Wrote ${allUsers.length} dual-role users to ${root}`);

if (apply) {
  const userDb = process.env.USER_DB_CONTAINER ?? "user-service-db-1";
  const creditDb = process.env.CREDIT_DB_CONTAINER ?? "credit-postgres";
  await psql(userDb, process.env.USER_DB_USER ?? "user_service", process.env.USER_DB_NAME ?? "user_db", userSql);
  await psql(creditDb, process.env.CREDIT_DB_USER ?? "credit", process.env.CREDIT_DB_NAME ?? "credit_db", creditSql);
  console.log("Applied user and credit seeds");
}

function uuid(name) {
  const bytes = createHash("sha256").update(`foc-load-v1-${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function userInserts(rows) {
  const batches = chunks(rows, 400).map((batch) => {
    const values = batch
      .map(
        (row) =>
          `('${row.id}','${row.email}','${row.name}','seeded','${row.telegramHandle}',NOW(),NOW(),'USER','ACTIVE',0,0,NOW(),NOW())`,
      )
      .join(",\n");
    return `INSERT INTO "User" (
  id, email, name, "passwordHash", "telegramHandle",
  "emailVerifiedAt", "telegramVerifiedAt", role, "accessStatus",
  "failedLoginAttempts", "authVersion", "createdAt", "updatedAt"
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  "emailVerifiedAt" = EXCLUDED."emailVerifiedAt",
  "telegramVerifiedAt" = EXCLUDED."telegramVerifiedAt",
  "accessStatus" = 'ACTIVE',
  "updatedAt" = NOW();`;
  });
  return `${batches.join("\n")}\n`;
}

function creditInserts(rows, balance) {
  const batches = chunks(rows, 400).map((batch) => {
    const values = batch.map((row) => `('${row.id}',${balance})`).join(",\n");
    return `INSERT INTO credit_user (user_id, balance) VALUES
${values}
ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance, updated_at = NOW();`;
  });
  return `${batches.join("\n")}\n`;
}

function chunks(rows, size) {
  const out = [];
  for (let index = 0; index < rows.length; index += size) {
    out.push(rows.slice(index, index + size));
  }
  return out;
}

function psql(container, user, database, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      ["exec", "-i", container, "psql", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`psql in ${container} exited ${code}`));
      }
    });
    child.stdin.end(readFileSync(file));
  });
}
