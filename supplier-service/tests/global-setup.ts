/*
Starts one official Postgres 17 container for the whole vitest run and hands its
connection URI to the workers. A container per test file would re-pay the image
start cost for every suite, so the lifecycle lives here instead of in beforeAll.

db/init/ 01–03 are copied into /docker-entrypoint-initdb.d in filename order.
04_import_campus.sh (campus JSON) is compose/cloud only — tests keep the three
fixtures from 03_seed.sql.
*/

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const IMAGE = process.env.TEST_POSTGRES_IMAGE ?? 'postgres:16';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INIT_SCRIPTS: Array<[source: string, target: string]> = [
  ['db/init/01_schema.sql', '01_schema.sql'],
  ['db/init/02_opening_hours.sql', '02_opening_hours.sql'],
  ['db/init/03_seed.sql', '03_seed.sql'],
];

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer(IMAGE)
    .withDatabase('postgres')
    .withUsername('postgres')
    .withPassword('postgres')
    .withCopyFilesToContainer(
      INIT_SCRIPTS.map(([source, target]) => ({
        source: path.join(serviceRoot, source),
        target: `/docker-entrypoint-initdb.d/${target}`,
      })),
    )
    .withStartupTimeout(180_000)
    .start();

  project.provide('databaseUrl', container.getConnectionUri());
}

export async function teardown() {
  await container?.stop();
}

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}
