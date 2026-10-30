/*
Starts one Supabase Postgres container for the whole vitest run and hands its
connection URI to the workers. A container per test file would re-pay the image
start cost for every suite, so the lifecycle lives here instead of in beforeAll.

The migrations and seed are mounted into /docker-entrypoint-initdb.d in the same
filename order compose.yaml uses, so the container comes up with the same schema,
search functions and seed rows as `docker compose up`.
*/

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

//Matches compose.yaml. The migrations are a pg17 dump, so an older tag will not apply cleanly.
const IMAGE = process.env.TEST_POSTGRES_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.167';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

//Order matters: the image's own init-scripts/ create the anon, authenticated and
//service_role roles first, then these run alphabetically.
const INIT_SCRIPTS: Array<[source: string, target: string]> = [
  ['supabase/migrations/20260925071312_remote_schema.sql', 'z01_schema.sql'],
  ['supabase/migrations/20260925102600_add_ts_vector.sql', 'z02_fts.sql'],
  ['supabase/migrations/20260925102800_add_search_functions.sql', 'z03_search_functions.sql'],
  ['supabase/migrations/20260927173000_create_unique_index.sql', 'z04_unique_index.sql'],
  ['supabase/migrations/20260927190000_updated_at_ms_precision.sql', 'z05_updated_at_precision.sql'],
  ['supabase/migrations/20261004172304_create_supplier_opening_hours.sql', 'z06_opening_hours.sql'],
  //the seed's opening hours reference Supplier_Database, so it has to run after both tables exist
  ['supabase/schemas/seed.sql', 'z07_seed.sql'],
  //generated location column backfills existing seed rows
  ['supabase/migrations/20261006102848_location_search.sql', 'z08_location_search.sql'],
];

let container: StartedPostgreSqlContainer | undefined;

//vitest 4 hands globalSetup the TestProject itself; provide is a method on it, so
//it has to be called on the project rather than destructured off it
export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer(IMAGE)
    .withDatabase('postgres')
    //The image's own migrate.sh init step connects as supabase_admin, and that role only
    //exists if initdb bootstraps it. Overriding POSTGRES_USER with anything else makes the
    //container exit before migrations ever run.
    .withUsername('supabase_admin')
    .withPassword('postgres')
    .withCopyFilesToContainer(
      INIT_SCRIPTS.map(([source, target]) => ({
        source: path.join(serviceRoot, source),
        target: `/docker-entrypoint-initdb.d/${target}`,
      })),
    )
    //First run has to pull the image and replay every migration.
    .withStartupTimeout(180_000)
    .start();

  //Never a hardcoded 5432: the mapped port is whatever the daemon handed out.
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
