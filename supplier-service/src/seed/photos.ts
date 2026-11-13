import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { seedLock, withTransaction, type Pool } from '../db.ts'
import { imageTypeOf, type PhotoInput } from '../domain/photo.ts'
import { storePhoto } from '../repository.ts'
import { decodeSeedFile, parseCsv } from './csv.ts'

interface Log {
  info(message: string): void
  warn(message: string): void
}

const RUN = 'seed-photos-1'

// Shrunk copies of the photos in data/images, which are several megabytes each.
// The seed file names them in its ImageURL column, e.g. .../ANNA.jpeg becomes
// ANNA.jpg and ANNA.thumb.jpg here.
export function seedPhotoDirectory(csvPath: string): string {
  return path.join(path.dirname(csvPath), '..', 'images', 'resized')
}

async function readPhoto(directory: string, name: string): Promise<PhotoInput | null> {
  try {
    const photo = await readFile(path.join(directory, `${name}.jpg`))
    const thumbnail = await readFile(path.join(directory, `${name}.thumb.jpg`))
    const photoType = imageTypeOf(photo)
    const thumbnailType = imageTypeOf(thumbnail)
    if (!photoType || !thumbnailType) return null
    return { photo, photoType, thumbnail, thumbnailType }
  } catch {
    return null
  }
}

// Runs once per database, also on one that was seeded before photos existed.
// After that an administrator may remove or replace any seed photo, and a
// restart never brings it back. Returns how many photos were added.
export async function seedPhotosOnce(pool: Pool, csvPath: string, log: Log, directory = seedPhotoDirectory(csvPath)): Promise<number> {
  const [header, ...rows] = parseCsv(decodeSeedFile(await readFile(csvPath)))
  const nameAt = header!.indexOf('Name')
  const imageAt = header!.indexOf('ImageURL')
  if (nameAt === -1 || imageAt === -1) return 0

  const wanted: { supplier: string; photo: PhotoInput }[] = []
  for (const row of rows) {
    const url = (row[imageAt] ?? '').trim()
    if (!url) continue
    const file = path.posix.basename(url.split('?')[0]!).replace(/\.[^.]+$/, '')
    const photo = await readPhoto(directory, file)
    if (photo) wanted.push({ supplier: (row[nameAt] ?? '').trim(), photo })
    else log.warn(`No seed photo ${file}.jpg and ${file}.thumb.jpg in ${directory}`)
  }
  // An image built without the photos must not use up the one run.
  if (wanted.length === 0) return 0

  return withTransaction(pool, async (db) => {
    await seedLock(db)
    const done = await db.query('INSERT INTO seed_runs (name) VALUES ($1) ON CONFLICT DO NOTHING', [RUN])
    if (done.rowCount === 0) return 0

    let added = 0
    for (const { supplier, photo } of wanted) {
      // Only a seeded supplier that still has its seed name and no photo of its own.
      const found = await db.query(
        `SELECT s.id FROM suppliers s
         WHERE s.name = $1 AND s.created_by IS NULL
           AND NOT EXISTS (SELECT 1 FROM supplier_photos p WHERE p.supplier_id = s.id)`,
        [supplier],
      )
      for (const { id } of found.rows as { id: string }[]) {
        await storePhoto(db, id, photo, null)
        added++
      }
    }
    log.info(`Added ${added} seed photos from ${directory}`)
    return added
  })
}
