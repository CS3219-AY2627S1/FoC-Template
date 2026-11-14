/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Local seed written as a test (`npm run seed`). It creates the reference data, then each
 *        supplier through the real creation service: details to MySQL, photos to MinIO, the location
 *        MinIO returns stored in MySQL. Safe to re-run (existing rows are skipped). Photos must be JPEG
 *        or PNG and exist on disk; others are skipped and reported. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, describe, expect, it } from 'vitest';
import { createLookupService } from '../../src/business/lookupService.js';
import { createSupplierCreationService } from '../../src/business/supplierCreationService.js';
import { createSupplierService } from '../../src/business/supplierService.js';
import { createSupplierUpdateService } from '../../src/business/supplierUpdateService.js';
import { config } from '../../src/config.js';
import { pool } from '../../src/db/pool.js';
import { createMysqlLookupRepository } from '../../src/persistence/mysqlLookupRepository.js';
import { createMysqlSupplierRepository } from '../../src/persistence/mysqlSupplierRepository.js';
import { createMysqlSupplierWriteRepository } from '../../src/persistence/mysqlSupplierWriteRepository.js';
import { createConfiguredPhotoStorage } from '../../src/storage/s3PhotoStorage.js';
import type { PhotoFile } from '../../src/storage/photoStorage.js';
import { AppError } from '../../src/utils/AppError.js';
import { SEED_LOCATION_LEVEL, seedSuppliers } from './supplierSeedData.js';

const IMAGE_ROOTS = [
  resolve(__dirname, '../../../frontend/public/images'),
  resolve(__dirname, '../../../foc-mockup/public/images'),
];
const MIME: Record<string, PhotoFile['mimeType']> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function loadPhoto(relative: string): { file?: PhotoFile; skipped?: string } {
  const mimeType = MIME[extname(relative).toLowerCase()];
  if (mimeType === undefined) return { skipped: `${relative}: only JPEG and PNG are accepted` };
  for (const root of IMAGE_ROOTS) {
    const path = resolve(root, relative);
    if (existsSync(path)) return { file: { buffer: readFileSync(path), mimeType } };
  }
  return { skipped: `${relative}: file not found` };
}

async function findId(sql: string, params: Array<string | number>, column: string): Promise<number | null> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  const row = rows[0];
  return row === undefined ? null : Number(row[column]);
}

describe('seed the local supplier data', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('creates reference data and every supplier through the creation service', async () => {
    const lookup = createLookupService(createMysqlLookupRepository(pool));
    const repo = createMysqlSupplierWriteRepository(pool);
    const reader = createSupplierService(createMysqlSupplierRepository(pool));
    const storage = createConfiguredPhotoStorage(config.photoStore);
    const creation = createSupplierCreationService({
      repo,
      storage,
      reader,
      update: createSupplierUpdateService({ repo, storage, reader }),
    });

    const categoryIds = new Map<string, number>();
    const locationIds = new Map<string, number>();

    // Reference data first, reusing a row when it already exists so the seed can be re-run.
    for (const name of new Set(seedSuppliers.flatMap((s) => s.categories))) {
      const id =
        (await findId('SELECT category_id FROM supplier_categories WHERE category_type = ?', [name], 'category_id')) ??
        (await lookup.createCategory(name)).category_id;
      categoryIds.set(name, id);
    }
    const facultyIds = new Map<string, number>();
    for (const s of seedSuppliers) {
      if (!facultyIds.has(s.faculty)) {
        const id =
          (await findId('SELECT faculty_id FROM faculties WHERE faculty = ?', [s.faculty], 'faculty_id')) ??
          (await lookup.createFaculty(s.faculty)).faculty_id;
        facultyIds.set(s.faculty, id);
      }
      const key = `${s.location}|${s.faculty}`;
      if (!locationIds.has(key)) {
        const facultyId = facultyIds.get(s.faculty) as number;
        const id =
          (await findId(
            'SELECT location_id FROM supplier_locations WHERE location = ? AND faculty_id = ? AND level = ?',
            [s.location, facultyId, SEED_LOCATION_LEVEL],
            'location_id',
          )) ?? (await lookup.createLocation({ location: s.location, facultyId, level: SEED_LOCATION_LEVEL })).location_id;
        locationIds.set(key, id);
      }
    }

    const skippedPhotos: string[] = [];
    const created: string[] = [];
    const existing: string[] = [];
    for (const s of seedSuppliers) {
      const { file, skipped } = loadPhoto(s.photo);
      if (skipped !== undefined) skippedPhotos.push(`${s.name} - ${skipped}`);
      try {
        await creation.createSupplier(
          {
            name: s.name,
            type: s.type,
            desc: s.desc,
            locationId: locationIds.get(`${s.location}|${s.faculty}`) as number,
            categoryIds: s.categories.map((c) => categoryIds.get(c) as number),
            hours: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, ...s.hours, is24h: false })),
          },
          file === undefined ? [] : [file],
          { userId: 'seed' },
        );
        created.push(s.name);
      } catch (error) {
        const duplicate = error instanceof AppError && error.statusCode === 422 && /already exists/.test(error.message);
        if (!duplicate) throw error;
        existing.push(s.name);
      }
    }
    console.log(`seed: created ${created.length}, already present ${existing.length}`);
    if (skippedPhotos.length > 0) console.log(`seed: no photo for:\n  ${skippedPhotos.join('\n  ')}`);

    // Everything is now readable through the same reader the API uses.
    const page = await reader.listAdminSuppliers({ page: 1, sortOrder: 'A-Z' });
    const names = page.data.map((s) => s.name);
    for (const s of seedSuppliers) expect(names).toContain(s.name);

    // A stored photo location is the one MinIO returned and it serves the image back.
    for (const supplier of page.data) {
      const seeded = seedSuppliers.find((s) => s.name === supplier.name);
      if (seeded === undefined || loadPhoto(seeded.photo).file === undefined) continue;
      const location = supplier.photos[0]?.photoLocation ?? '';
      expect(location.startsWith(`${config.photoStore.endpoint}/`)).toBe(true);
      const response = await fetch(location);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/^image\//);
    }
  });
});
