// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Debugged the ECONNRESET / "socket hang up" flake in the test suite (fix F2); created
//        this shared loopback supertest server so test files no longer start one ephemeral
//        wildcard server per request. No requirements, architecture, schema, or API decisions
//        were made by the AI tool.
// Author review:
import http from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import app from '../../src/app.js';

// Why one shared server, bound to 127.0.0.1 (fix F2):
// Calling supertest with the bare Express app makes it create a fresh server per call and
// `listen(0)` on the wildcard address. On macOS, a wildcard `listen(0)` can be handed a port that
// another process already holds on 127.0.0.1 (the kernel skips that conflict because the bind
// addresses differ), so the loopback client then talks to the *other* process: it answers with
// its own 401/404 or just hangs up, which the suite saw as ECONNRESET / "socket hang up" / a 401
// with no `code`. Binding explicitly to 127.0.0.1 makes the kernel detect the conflict and skip
// the port, and one server per file instead of one per request removes the repeated dice rolls.
let server: http.Server | undefined;

// Registered at import time, so any test file (or helper) that imports this module gets the
// server for the duration of that file.
beforeAll(async () => {
  if (server) return;
  const s = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => resolve());
  });
  server = s;
});

afterAll(async () => {
  const s = server;
  server = undefined;
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
});

// Drop-in replacement for the per-call supertest factory: every request in the file shares one
// listener.
export function api(): ReturnType<typeof request> {
  if (!server) {
    throw new Error('test server not started: api() must be called inside a test or hook');
  }
  return request(server);
}
