/*
Per-test state isolation. The container is shared across the whole run, so each
test has to put the table back to its seeded state rather than assume a fresh db.
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '@database/db';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(here, '../../supabase/schemas/seed.sql');

let seedSql: string | undefined;

export async function resetDatabase() {
  seedSql ??= await fs.readFile(seedPath, 'utf8');

  await truncateSuppliers();
  //seed.sql ends with a setval, so the identity sequence resumes past the seeded ids.
  await db.query(seedSql);
}

//for the handful of tests that need to observe an empty table; afterEach reseeds
export async function truncateSuppliers() {
  await db.query('TRUNCATE TABLE public."Supplier_Database" RESTART IDENTITY CASCADE;');
}
