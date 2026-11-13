import { createHash } from 'node:crypto'
import { withTransaction, type Db, type Pool } from './db.ts'
import type { PhotoInput } from './domain/photo.ts'
import type { ListFilters } from './domain/query.ts'
import type { DayHours, Supplier, SupplierInput } from './domain/supplier.ts'

// One query per read: the weekday rows are folded into a JSON array on each
// supplier so that a page of results never needs a second round trip.
const HOURS_JOIN = `
  LEFT JOIN LATERAL (
    SELECT json_agg(
      json_build_object('day', sh.weekday, 'opens', sh.opens_minute, 'closes', sh.closes_minute)
      ORDER BY sh.weekday
    ) AS hours
    FROM supplier_hours sh
    WHERE sh.supplier_id = s.id
  ) h ON true`

// Only the photo's version: a listing never reads the photo bytes.
const PHOTO_JOIN = `LEFT JOIN supplier_photos p ON p.supplier_id = s.id`

const SELECT_SUPPLIERS = `
  SELECT s.*, COALESCE(h.hours, '[]'::json) AS hours, p.version AS photo_version
  FROM suppliers s
  ${HOURS_JOIN}
  ${PHOTO_JOIN}`

interface SupplierRow {
  id: string
  name: string
  type: string
  zone: string
  building: string
  address: string
  description: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  email: string | null
  status: Supplier['status']
  created_at: Date
  updated_at: Date
  hours: DayHours[]
  photo_version: string | null
  // Only in a list that was given a point to measure from.
  distance_m?: number | null
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    zone: row.zone,
    building: row.building,
    address: row.address,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    email: row.email,
    status: row.status,
    hours: row.hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photoVersion: row.photo_version,
    distanceMeters: row.distance_m ?? null,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getSupplier(db: Db, id: string): Promise<Supplier | null> {
  // An id that is not a UUID cannot exist, and would make the database error.
  if (!UUID.test(id)) return null
  const result = await db.query(`${SELECT_SUPPLIERS} WHERE s.id = $1`, [id])
  return result.rows[0] ? toSupplier(result.rows[0] as SupplierRow) : null
}

// A search term matches when it appears in any of these columns, and every term
// has to match.
const SEARCH_COLUMNS = ['name', 'type', 'building', 'zone', 'address']

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function buildWhere(filters: ListFilters, accountId: string | null) {
  const clauses: string[] = []
  const params: unknown[] = []
  const bind = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  if (filters.status !== 'all') clauses.push(`s.status = ${bind(filters.status)}`)
  if (filters.favorites) {
    clauses.push(
      `EXISTS (SELECT 1 FROM supplier_favorites f WHERE f.supplier_id = s.id AND f.account_id = ${bind(accountId)})`,
    )
  }
  if (filters.type) clauses.push(`lower(s.type) = lower(${bind(filters.type)})`)
  if (filters.zone) clauses.push(`lower(s.zone) = lower(${bind(filters.zone)})`)
  if (filters.building) clauses.push(`lower(s.building) = lower(${bind(filters.building)})`)
  for (const term of filters.terms) {
    const like = bind(`%${escapeLike(term)}%`)
    clauses.push(`(${SEARCH_COLUMNS.map((c) => `s.${c} ILIKE ${like}`).join(' OR ')})`)
  }

  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

// The most a list without paging returns. Far more suppliers than one campus has.
export const UNPAGED_LIMIT = 2000

// accountId is whose favorites `filters.favorites` means, from the session.
// `unpaged` returns every match in order, for filters that are applied in code
// afterwards, such as open now.
export async function listSuppliers(
  db: Db,
  filters: ListFilters,
  accountId: string | null,
  unpaged = false,
): Promise<{ items: Supplier[]; total: number }> {
  const where = buildWhere(filters, accountId)
  const params = [...where.params]
  const bind = (value: unknown) => {
    params.push(value)
    return `$${params.length}`
  }

  // Metres on a flat map. Over one campus it is within a few metres of the
  // distance on a sphere, and it needs no database extension. Null without
  // coordinates, so those suppliers sort last.
  let distance = 'NULL::double precision'
  if (filters.near) {
    const latitude = bind(filters.near.latitude)
    const longitude = bind(filters.near.longitude)
    distance = `111320 * sqrt(power(s.latitude - ${latitude}, 2)
      + power((s.longitude - ${longitude}) * cos(radians(${latitude}::double precision)), 2))`
  }
  const order = filters.sort === 'distance' ? 'distance_m ASC NULLS LAST, lower(s.name), s.id' : 'lower(s.name), s.id'
  const skipped = unpaged ? 0 : (filters.page - 1) * filters.pageSize
  const paging = unpaged ? `LIMIT ${UNPAGED_LIMIT}` : `LIMIT ${bind(filters.pageSize)} OFFSET ${bind(skipped)}`

  // The page is cut first and only then joined to its opening hours. The total
  // is counted over every match in the same pass.
  const rows = await db.query(
    `WITH page AS (
       SELECT s.*, ${distance} AS distance_m, count(*) OVER () AS total_count
       FROM suppliers s
       ${where.sql}
       ORDER BY ${order}
       ${paging}
     )
     SELECT s.*, COALESCE(h.hours, '[]'::json) AS hours, p.version AS photo_version
     FROM page s
     ${HOURS_JOIN}
     ${PHOTO_JOIN}
     ORDER BY ${order}`,
    params,
  )

  const items = (rows.rows as SupplierRow[]).map(toSupplier)
  if (rows.rows.length > 0) return { items, total: Number(rows.rows[0].total_count) }
  // A page past the end has no rows to carry the total, so count separately.
  if (skipped === 0) return { items, total: 0 }
  const count = await db.query(`SELECT count(*)::int AS total FROM suppliers s ${where.sql}`, where.params)
  return { items, total: count.rows[0].total as number }
}

export interface FilterValues {
  types: string[]
  zones: string[]
  buildings: string[]
}

// The list filters ignore case, so two spellings that differ only in case are offered once.
export async function listFilterValues(db: Db, status: ListFilters['status']): Promise<FilterValues> {
  const where = status === 'all' ? '' : 'WHERE status = $1'
  const distinct = (column: string) =>
    `ARRAY(SELECT min(${column}) FROM suppliers ${where} GROUP BY lower(${column}) ORDER BY lower(${column}))`
  const result = await db.query(
    `SELECT ${distinct('type')} AS types, ${distinct('zone')} AS zones, ${distinct('building')} AS buildings`,
    status === 'all' ? [] : [status],
  )
  return result.rows[0] as FilterValues
}

async function insertHours(db: Db, supplierId: string, hours: DayHours[]): Promise<void> {
  await db.query(
    `INSERT INTO supplier_hours (supplier_id, weekday, opens_minute, closes_minute)
     SELECT $1::uuid, * FROM unnest($2::smallint[], $3::smallint[], $4::smallint[])`,
    [supplierId, hours.map((h) => h.day), hours.map((h) => h.opens), hours.map((h) => h.closes)],
  )
}

// Inserts without opening a transaction, so that the seed can add all of its
// suppliers in one.
export async function insertSupplier(
  db: Db,
  input: SupplierInput,
  actor: string | null,
): Promise<string> {
  const result = await db.query(
    `INSERT INTO suppliers
       (name, type, zone, building, address, description, latitude, longitude,
        phone, email, status, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
     RETURNING id`,
    [
      input.name,
      input.type,
      input.zone,
      input.building,
      input.address,
      input.description,
      input.latitude,
      input.longitude,
      input.phone,
      input.email,
      input.status,
      actor,
    ],
  )
  const id = result.rows[0].id as string
  await insertHours(db, id, input.hours)
  return id
}

export async function createSupplier(pool: Pool, input: SupplierInput, actor: string): Promise<Supplier> {
  return withTransaction(pool, async (db) => {
    const id = await insertSupplier(db, input, actor)
    return (await getSupplier(db, id))!
  })
}

const PATCH_COLUMNS = [
  'name',
  'type',
  'zone',
  'building',
  'address',
  'description',
  'latitude',
  'longitude',
  'phone',
  'email',
  'status',
] as const

export async function updateSupplier(
  pool: Pool,
  id: string,
  patch: Partial<SupplierInput>,
  actor: string,
): Promise<Supplier | null> {
  if (!UUID.test(id)) return null
  return withTransaction(pool, async (db) => {
    // The row lock makes two updates to one supplier run one after the other.
    const locked = await db.query('SELECT id FROM suppliers WHERE id = $1 FOR UPDATE', [id])
    if (locked.rowCount === 0) return null

    const params: unknown[] = [id]
    const assignments: string[] = []
    for (const column of PATCH_COLUMNS) {
      if (!Object.hasOwn(patch, column)) continue
      params.push(patch[column])
      assignments.push(`${column} = $${params.length}`)
    }
    params.push(actor)
    assignments.push(`updated_by = $${params.length}`, 'updated_at = now()')
    await db.query(`UPDATE suppliers SET ${assignments.join(', ')} WHERE id = $1`, params)

    if (patch.hours) {
      await db.query('DELETE FROM supplier_hours WHERE supplier_id = $1', [id])
      await insertHours(db, id, patch.hours)
    }
    return getSupplier(db, id)
  })
}

// Suppliers are never removed. Deactivating one that is already Inactive leaves
// it untouched, so repeating the request changes nothing.
export async function deactivateSupplier(db: Db, id: string, actor: string): Promise<Supplier | null> {
  if (!UUID.test(id)) return null
  await db.query(
    `UPDATE suppliers SET status = 'Inactive', updated_at = now(), updated_by = $2
     WHERE id = $1 AND status <> 'Inactive'`,
    [id, actor],
  )
  return getSupplier(db, id)
}

// Without a transaction of its own, so that the seed can store its photos in one.
export async function storePhoto(db: Db, id: string, input: PhotoInput, actor: string | null): Promise<void> {
  const version = createHash('sha256').update(input.photo).update(input.thumbnail).digest('hex').slice(0, 16)
  await db.query(
    `INSERT INTO supplier_photos (supplier_id, photo, photo_type, thumbnail, thumbnail_type, version, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (supplier_id) DO UPDATE SET
       photo = EXCLUDED.photo, photo_type = EXCLUDED.photo_type,
       thumbnail = EXCLUDED.thumbnail, thumbnail_type = EXCLUDED.thumbnail_type,
       version = EXCLUDED.version, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [id, input.photo, input.photoType, input.thumbnail, input.thumbnailType, version, actor],
  )
}

// Replaces the photo, or adds the first one. Null when there is no such supplier.
export async function setSupplierPhoto(pool: Pool, id: string, input: PhotoInput, actor: string): Promise<Supplier | null> {
  if (!UUID.test(id)) return null
  return withTransaction(pool, async (db) => {
    const locked = await db.query('SELECT id FROM suppliers WHERE id = $1 FOR UPDATE', [id])
    if (locked.rowCount === 0) return null
    await storePhoto(db, id, input, actor)
    // The photo is part of what the supplier looks like, so it counts as a change to it.
    await db.query('UPDATE suppliers SET updated_at = now(), updated_by = $2 WHERE id = $1', [id, actor])
    return getSupplier(db, id)
  })
}

// Removing a photo that is not there changes nothing, so it can be repeated.
export async function removeSupplierPhoto(pool: Pool, id: string, actor: string): Promise<Supplier | null> {
  if (!UUID.test(id)) return null
  return withTransaction(pool, async (db) => {
    const locked = await db.query('SELECT id FROM suppliers WHERE id = $1 FOR UPDATE', [id])
    if (locked.rowCount === 0) return null
    const removed = await db.query('DELETE FROM supplier_photos WHERE supplier_id = $1', [id])
    if (removed.rowCount) {
      await db.query('UPDATE suppliers SET updated_at = now(), updated_by = $2 WHERE id = $1', [id, actor])
    }
    return getSupplier(db, id)
  })
}

export type PhotoSize = 'photo' | 'thumbnail'

// Two fixed queries rather than a column name in the SQL.
const PHOTO_QUERIES: Record<PhotoSize, string> = {
  photo: 'SELECT photo AS bytes, photo_type AS type, version FROM supplier_photos WHERE supplier_id = $1',
  thumbnail: 'SELECT thumbnail AS bytes, thumbnail_type AS type, version FROM supplier_photos WHERE supplier_id = $1',
}

export async function getSupplierPhoto(
  db: Db,
  id: string,
  size: PhotoSize,
): Promise<{ bytes: Buffer; type: string; version: string } | null> {
  if (!UUID.test(id)) return null
  const result = await db.query(PHOTO_QUERIES[size], [id])
  return (result.rows[0] as { bytes: Buffer; type: string; version: string } | undefined) ?? null
}

export async function listFavoriteIds(db: Db, accountId: string): Promise<string[]> {
  const result = await db.query(
    'SELECT supplier_id FROM supplier_favorites WHERE account_id = $1 ORDER BY created_at, supplier_id',
    [accountId],
  )
  return result.rows.map((row) => row.supplier_id as string)
}

// Adding a favorite twice keeps one. False when there is no such supplier.
export async function addFavorite(db: Db, accountId: string, supplierId: string): Promise<boolean> {
  if (!UUID.test(supplierId)) return false
  try {
    await db.query(
      'INSERT INTO supplier_favorites (account_id, supplier_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [accountId, supplierId],
    )
    return true
  } catch (error) {
    // 23503: the supplier the foreign key points at does not exist.
    if ((error as { code?: string }).code === '23503') return false
    throw error
  }
}

export async function removeFavorite(db: Db, accountId: string, supplierId: string): Promise<void> {
  if (!UUID.test(supplierId)) return
  await db.query('DELETE FROM supplier_favorites WHERE account_id = $1 AND supplier_id = $2', [accountId, supplierId])
}

export async function countSuppliers(db: Db): Promise<number> {
  const result = await db.query('SELECT count(*)::int AS total FROM suppliers')
  return result.rows[0].total as number
}
