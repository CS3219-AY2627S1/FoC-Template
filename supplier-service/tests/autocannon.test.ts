/*
Scalability testing with autocannon.

Kept out of the default `yarn test` run, which is scoped to tests/api, because
this measures throughput rather than correctness and takes seconds per scenario.
Run it on its own with `yarn test:perf`.

src/app.ts deliberately does not listen, so this file binds it to port 0 and
lets the OS pick a free port. The database underneath is the same testcontainers
Postgres the API suites use, seeded from supabase/schemas/seed.sql, so the
numbers describe the service and the driver rather than an empty table.

Both scenarios are reads. Hammering a write endpoint would fight the unique
index and the optimistic concurrency check, which measures contention rather
than capacity.
*/

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import autocannon from 'autocannon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '@/app';
import pool from '@database/db';
import { resetDatabase } from './helpers/reset-database';

//10 concurrent clients is roughly a tutorial-sized class, well under the pool's 11 connections
const CONNECTIONS = 10;
const DURATION_SECONDS = 5;

/*
Deliberately generous. This runs on whatever laptop happens to be building, so
the point is to catch a service that falls over or errors under load, not to
police a millisecond budget.
*/
const MAX_P99_LATENCY_MS = 2000;
const MIN_REQUESTS_PER_SECOND = 20;

let server: Server;
let baseUrl: string;

async function measure(path: string) {
  const result = await autocannon({
    url: `${baseUrl}${path}`,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
  });

  console.log(
    `${path}: ${result.requests.average.toFixed(1)} req/s, ` +
      `latency mean ${result.latency.mean}ms p99 ${result.latency.p99}ms, ` +
      `${result.non2xx} non-2xx, ${result.errors} errors`,
  );

  return result;
}

beforeAll(async () => {
  await resetDatabase();

  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });

  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  await pool.end();
});

describe('scalability', () => {
  it(
    'serves the supplier list under sustained load',
    async () => {
      const result = await measure('/suppliers');

      expect(result.non2xx).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.timeouts).toBe(0);
      expect(result.latency.p99).toBeLessThan(MAX_P99_LATENCY_MS);
      expect(result.requests.average).toBeGreaterThan(MIN_REQUESTS_PER_SECOND);
    },
    (DURATION_SECONDS + 30) * 1000,
  );

  //the full text search path does real index work, so it is the more interesting of the two
  it(
    'serves full text search under sustained load',
    async () => {
      const result = await measure('/suppliers/search?q=coffee');

      expect(result.non2xx).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.timeouts).toBe(0);
      expect(result.latency.p99).toBeLessThan(MAX_P99_LATENCY_MS);
      expect(result.requests.average).toBeGreaterThan(MIN_REQUESTS_PER_SECOND);
    },
    (DURATION_SECONDS + 30) * 1000,
  );
});
