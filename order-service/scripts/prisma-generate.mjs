// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-11-02
//  2026-11-02: CI setup - postinstall hook so `npm ci && npm test` generates the Prisma
//    client unaided. prisma.config.ts resolves DATABASE_URL eagerly and throws when it is
//    unset, so a placeholder is supplied here; the same dummy-URL approach the Dockerfile's
//    build stage already uses.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The Dockerfile's `deps` stage runs `npm ci` with only package.json and the lockfile
// copied, before the source arrives, so there is no schema to generate from yet. Skip
// rather than fail: that stage's `build` target runs `prisma generate` explicitly once
// the source is in place.
if (!existsSync(resolve(root, 'prisma/schema.prisma'))) {
  console.log('postinstall: no prisma/schema.prisma yet, skipping prisma generate');
  process.exit(0);
}

// `prisma generate` reads the schema and writes the client; it opens no connection. The
// URL only has to parse, because prisma.config.ts calls env('DATABASE_URL') at load time
// and throws on a missing value. A real DATABASE_URL, if one is set, is left alone.
const PLACEHOLDER = 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL || PLACEHOLDER };

const result = spawnSync('npx', ['prisma', 'generate'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true, // npx is a .cmd shim on Windows
});

process.exit(result.status ?? 1);
