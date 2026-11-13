#!/usr/bin/env node
/**
 * AI Assistance Disclosure
 * Tool: Claude (Sonnet 5.5)
 * Scope: Local helper that mints test JWTs so routes can be tried without the user service
 *
 * LOCAL DEVELOPMENT ONLY. Not copied into the Docker image.
 *
 * Needs only Node (no npm install). Reads JWT_SECRET from the environment or
 * from ./.env, signs an HS256 token with the same payload shape the user
 * service issues, and prints it.
 *
 * Usage:
 *   node scripts/dev-token.js                          # random user, REQUESTER
 *   node scripts/dev-token.js --roles COURIER
 *   node scripts/dev-token.js --sub 3e8fac54-43db-4557-924d-6323356e4dbb --roles ADMIN,COURIER,REQUESTER
 *   node scripts/dev-token.js --expires 2h             # default 1h; accepts s, m, h, d
 */

import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

function readEnvFile() {
  try {
    const text = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
    return out;
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) {
      console.error("Usage: node scripts/dev-token.js [--sub <uuid>] [--roles A,B] [--expires 1h]");
      process.exit(1);
    }
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function toSeconds(text) {
  const m = /^(\d+)([smhd])$/.exec(text);
  if (!m) {
    console.error("--expires must look like 30m, 1h, 7d");
    process.exit(1);
  }
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
}

const b64url = (input) => Buffer.from(input).toString("base64url");

const args = parseArgs(process.argv.slice(2));
const secret = process.env.JWT_SECRET || readEnvFile().JWT_SECRET;
if (!secret) {
  console.error("JWT_SECRET not found in the environment or .env");
  process.exit(1);
}

const roles = (args.roles || "REQUESTER").split(",").map((r) => r.trim().toUpperCase());
const valid = ["ADMIN", "REQUESTER", "COURIER"];
if (!roles.every((r) => valid.includes(r))) {
  console.error(`Roles must be among: ${valid.join(", ")}`);
  process.exit(1);
}

const iat = Math.floor(Date.now() / 1000);
const payload = {
  sub: args.sub || crypto.randomUUID(),
  roles,
  iat,
  exp: iat + toSeconds(args.expires || "1h")
};

const unsigned = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
const signature = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");

console.error(`sub=${payload.sub} roles=${roles.join(",")}`); // stderr, so stdout is just the token
console.log(`${unsigned}.${signature}`);