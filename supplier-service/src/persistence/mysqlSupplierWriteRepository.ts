/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the MySQL write repository (create/reactivate transactions) from the Phase 2 plan (Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29 update): Reactivation now also replaces supplier_name with the submitted spelling (Phase 2 Task 7 review fix).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added findCurrent and updateSupplier (Phase 3 Task 5).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added softDelete, which writes the outbox rows in the same transaction (Phase 4 plan Task 4).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): updateSupplier writes the excluded-photo cleanup outbox rows in its transaction (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): removed reactivateSupplier; updateSupplier gains reactivation mode (flags restored in the edit's own UPDATE) (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): findCurrent returns is_active; updateSupplier writes SupplierChange.extraTasks to the outbox (team decision in chat).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CurrentPhoto } from '../business/photoPlan.js';
import { AppError } from '../utils/AppError.js';
import { insertOutboxRows } from './outboxWriter.js';
import type { NewSupplier, SupplierWriteRepository } from './supplierWriteRepository.js';

function duplicate(): AppError {
  const message = 'A supplier with the same name, type and location already exists.';
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field: 'name', location: 'body', message }],
  });
}

export function createMysqlSupplierWriteRepository(pool: Pool): SupplierWriteRepository {
  async function inTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      // A failed rollback must not mask the original error; release still runs in finally.
      await conn.rollback().catch(() => undefined);
      throw error;
    } finally {
      conn.release();
    }
  }

  async function insertChildren(conn: PoolConnection, supplierId: number, input: NewSupplier): Promise<void> {
    if (input.categoryIds.length > 0) {
      await conn.query('INSERT INTO supplier_category_map (supplier_id, category_id) VALUES ?', [
        input.categoryIds.map((categoryId) => [supplierId, categoryId]),
      ]);
    }
    if (input.hours.length > 0) {
      await conn.query(
        'INSERT INTO supplier_hours (supplier_id, day_of_week, open_time, close_time, is_24h) VALUES ?',
        [input.hours.map((hour) => [supplierId, hour.day, hour.open, hour.close, hour.is24h ? 1 : 0])],
      );
    }
    if (input.photoLocations.length > 0) {
      await conn.query('INSERT INTO supplier_photos (supplier_id, photo_location, display_order) VALUES ?', [
        input.photoLocations.map((location, index) => [supplierId, location, index]),
      ]);
    }
  }

  return {
    async findByIdentity(name, type, locationId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, is_deleted FROM supplier
         WHERE supplier_name = ? AND supplier_type = ? AND location_id = ?`,
        [name, type, locationId],
      );
      const row = rows[0];
      return row === undefined ? null : { supplierId: Number(row.supplier_id), isDeleted: Boolean(row.is_deleted) };
    },

    async locationExists(locationId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT location_id FROM supplier_locations WHERE location_id = ?',
        [locationId],
      );
      return rows.length > 0;
    },

    async findMissingCategoryIds(categoryIds) {
      if (categoryIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT category_id FROM supplier_categories WHERE category_id IN (?)',
        [categoryIds],
      );
      const found = new Set(rows.map((row) => Number(row.category_id)));
      return categoryIds.filter((id) => !found.has(id));
    },

    async insertSupplier(input) {
      try {
        return await inTransaction(async (conn) => {
          const [result] = await conn.query<ResultSetHeader>(
            `INSERT INTO supplier
               (supplier_name, supplier_type, supplier_desc, location_id, created_on, created_by, updated_on)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [input.name, input.type, input.desc, input.locationId, input.now, input.createdBy, input.now],
          );
          const supplierId = Number(result.insertId);
          await insertChildren(conn, supplierId, input);
          return supplierId;
        });
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'ER_DUP_ENTRY') throw duplicate();
        throw error;
      }
    },

    async findCurrent(supplierId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, supplier_name, supplier_type, location_id, is_deleted, is_active, version
         FROM supplier WHERE supplier_id = ?`,
        [supplierId],
      );
      const row = rows[0];
      if (row === undefined) return null;
      const [photos] = await pool.query<RowDataPacket[]>(
        'SELECT photo_id, photo_location FROM supplier_photos WHERE supplier_id = ? ORDER BY display_order',
        [supplierId],
      );
      return {
        supplierId: Number(row.supplier_id),
        name: String(row.supplier_name),
        type: row.supplier_type as 'Store' | 'Facility',
        locationId: Number(row.location_id),
        isDeleted: Boolean(row.is_deleted),
        isActive: Boolean(row.is_active),
        version: Number(row.version),
        photos: photos.map((photo) => ({ photoId: Number(photo.photo_id), location: String(photo.photo_location) })),
      };
    },

    async updateSupplier(supplierId, change) {
      try {
        return await inTransaction(async (conn) => {
          const sets: string[] = [];
          const params: unknown[] = [];
          const set = (column: string, value: unknown) => {
            sets.push(`${column} = ?`);
            params.push(value);
          };
          if (change.name !== undefined) set('supplier_name', change.name);
          if (change.type !== undefined) set('supplier_type', change.type);
          if (change.desc !== undefined) set('supplier_desc', change.desc);
          if (change.locationId !== undefined) set('location_id', change.locationId);
          if (change.isActive !== undefined && change.reactivate !== true) set('is_active', change.isActive ? 1 : 0);
          if (change.reactivate === true) sets.push('is_deleted = FALSE', 'is_active = TRUE');
          set('updated_on', change.now);
          sets.push('version = version + 1');

          const [updated] = await conn.query<ResultSetHeader>(
            `UPDATE supplier SET ${sets.join(', ')}
             WHERE supplier_id = ? AND version = ? AND is_deleted = ${change.reactivate === true ? 'TRUE' : 'FALSE'}`,
            [...params, supplierId, change.version],
          );
          if (updated.affectedRows === 0) {
            throw new AppError(409, 'Conflict', 'The supplier was modified by someone else. Re-fetch it and retry.');
          }

          if (change.categoryIds !== undefined) {
            await conn.query('DELETE FROM supplier_category_map WHERE supplier_id = ?', [supplierId]);
            if (change.categoryIds.length > 0) {
              await conn.query('INSERT INTO supplier_category_map (supplier_id, category_id) VALUES ?', [
                change.categoryIds.map((categoryId) => [supplierId, categoryId]),
              ]);
            }
          }
          if (change.hours !== undefined) {
            await conn.query('DELETE FROM supplier_hours WHERE supplier_id = ?', [supplierId]);
            await conn.query(
              'INSERT INTO supplier_hours (supplier_id, day_of_week, open_time, close_time, is_24h) VALUES ?',
              [change.hours.map((hour) => [supplierId, hour.day, hour.open, hour.close, hour.is24h ? 1 : 0])],
            );
          }

          const removedPhotos: CurrentPhoto[] = [];
          if (change.photos !== undefined) {
            const [current] = await conn.query<RowDataPacket[]>(
              'SELECT photo_id, photo_location FROM supplier_photos WHERE supplier_id = ? ORDER BY display_order FOR UPDATE',
              [supplierId],
            );
            const kept = new Set(change.photos.flatMap((p) => (p.kind === 'existing' ? [p.photoId] : [])));
            for (const row of current) {
              if (!kept.has(Number(row.photo_id))) {
                removedPhotos.push({ photoId: Number(row.photo_id), location: String(row.photo_location) });
              }
            }
            if (removedPhotos.length > 0) {
              await conn.query('DELETE FROM supplier_photos WHERE supplier_id = ? AND photo_id IN (?)', [
                supplierId,
                removedPhotos.map((photo) => photo.photoId),
              ]);
            }
            // Move kept rows out of the way first so the UNIQUE (supplier_id, display_order) key never collides.
            await conn.query(
              'UPDATE supplier_photos SET display_order = display_order + 1000000 WHERE supplier_id = ?',
              [supplierId],
            );
            for (const [order, photo] of change.photos.entries()) {
              if (photo.kind === 'new') {
                await conn.query(
                  'INSERT INTO supplier_photos (supplier_id, photo_location, display_order) VALUES (?, ?, ?)',
                  [supplierId, photo.location, order],
                );
              } else {
                await conn.query(
                  'UPDATE supplier_photos SET display_order = ? WHERE photo_id = ? AND supplier_id = ?',
                  [order, photo.photoId, supplierId],
                );
              }
            }
          }
          if (change.onPhotosRemoved !== undefined) {
            await insertOutboxRows(conn, change.version + 1, change.onPhotosRemoved(removedPhotos));
          }
          if (change.extraTasks !== undefined) {
            await insertOutboxRows(conn, change.version + 1, change.extraTasks);
          }
          return { removedPhotos };
        });
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'ER_DUP_ENTRY') throw duplicate();
        throw error;
      }
    },

    async softDelete(supplierId, now, tasks) {
      return inTransaction(async (conn) => {
        const [result] = await conn.query<ResultSetHeader>(
          `UPDATE supplier SET is_deleted = TRUE, updated_on = ?, version = version + 1
           WHERE supplier_id = ? AND is_deleted = FALSE`,
          [now, supplierId],
        );
        if (result.affectedRows === 0) return false;
        const [rows] = await conn.query<RowDataPacket[]>(
          'SELECT version FROM supplier WHERE supplier_id = ?',
          [supplierId],
        );
        const row = rows[0];
        if (row === undefined) throw new Error(`Supplier ${supplierId} vanished inside its own transaction.`);
        await insertOutboxRows(conn, Number(row.version), tasks);
        return true;
      });
    },
  };
}
