/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the MySQL lookup repository and DB-error mapping per Phase 2 plan Task 4
 *        (Arch §6.4, §7, §9 item 21). No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 */
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../utils/AppError.js';
import type {
  CategoryRecord,
  FacultyRecord,
  LocationPatch,
  LocationRecord,
  LookupRepository,
} from './lookupRepository.js';

function violation(field: string, message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field, location: 'body', message }],
  });
}

function mapDbError(error: unknown, subject: string): never {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ER_DUP_ENTRY') {
    throw violation(subject, `This ${subject} already exists.`);
  }
  if (code === 'ER_ROW_IS_REFERENCED_2') {
    throw violation(subject, `This ${subject} is still referenced and cannot be deleted.`);
  }
  if (code === 'ER_NO_REFERENCED_ROW_2') {
    throw violation('faculty_id', 'The referenced faculty does not exist.');
  }
  throw error;
}

export function createMysqlLookupRepository(pool: Pool): LookupRepository {
  async function insert(sql: string, params: unknown[], subject: string): Promise<number> {
    try {
      const [result] = await pool.query<ResultSetHeader>(sql, params);
      return Number(result.insertId);
    } catch (error) {
      return mapDbError(error, subject);
    }
  }

  async function remove(sql: string, id: number, subject: string): Promise<boolean> {
    try {
      const [result] = await pool.query<ResultSetHeader>(sql, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      return mapDbError(error, subject);
    }
  }

  async function update(sql: string, params: unknown[], subject: string): Promise<void> {
    try {
      await pool.query(sql, params);
    } catch (error) {
      mapDbError(error, subject);
    }
  }

  async function readOne<T>(sql: string, id: number): Promise<T | null> {
    const [rows] = await pool.query<RowDataPacket[]>(sql, [id]);
    return rows[0] === undefined ? null : (rows[0] as unknown as T);
  }

  return {
    async createFaculty(faculty) {
      const id = await insert('INSERT INTO faculties (faculty) VALUES (?)', [faculty], 'faculty');
      return { faculty_id: id, faculty };
    },
    async updateFaculty(id, faculty) {
      await update('UPDATE faculties SET faculty = ? WHERE faculty_id = ?', [faculty, id], 'faculty');
      const row = await readOne<FacultyRecord>('SELECT faculty_id, faculty FROM faculties WHERE faculty_id = ?', id);
      return row === null ? null : { faculty_id: Number(row.faculty_id), faculty: row.faculty };
    },
    deleteFaculty: (id) => remove('DELETE FROM faculties WHERE faculty_id = ?', id, 'faculty'),

    async createLocation({ location, facultyId, level }) {
      const id = await insert(
        'INSERT INTO supplier_locations (location, faculty_id, level) VALUES (?, ?, ?)',
        [location, facultyId, level],
        'location',
      );
      return { location_id: id, location, faculty_id: facultyId, level };
    },
    async updateLocation(id, patch: LocationPatch) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.location !== undefined) {
        sets.push('location = ?');
        params.push(patch.location);
      }
      if (patch.facultyId !== undefined) {
        sets.push('faculty_id = ?');
        params.push(patch.facultyId);
      }
      if (patch.level !== undefined) {
        sets.push('level = ?');
        params.push(patch.level);
      }
      if (sets.length > 0) {
        await update(
          `UPDATE supplier_locations SET ${sets.join(', ')} WHERE location_id = ?`,
          [...params, id],
          'location',
        );
      }
      const row = await readOne<LocationRecord>(
        'SELECT location_id, location, faculty_id, level FROM supplier_locations WHERE location_id = ?',
        id,
      );
      return row === null
        ? null
        : {
            location_id: Number(row.location_id),
            location: row.location,
            faculty_id: Number(row.faculty_id),
            level: Number(row.level),
          };
    },
    deleteLocation: (id) => remove('DELETE FROM supplier_locations WHERE location_id = ?', id, 'location'),

    async createCategory(categoryType) {
      const id = await insert(
        'INSERT INTO supplier_categories (category_type) VALUES (?)',
        [categoryType],
        'category_type',
      );
      return { category_id: id, category_type: categoryType };
    },
    async updateCategory(id, categoryType) {
      await update(
        'UPDATE supplier_categories SET category_type = ? WHERE category_id = ?',
        [categoryType, id],
        'category_type',
      );
      const row = await readOne<CategoryRecord>(
        'SELECT category_id, category_type FROM supplier_categories WHERE category_id = ?',
        id,
      );
      return row === null ? null : { category_id: Number(row.category_id), category_type: row.category_type };
    },
    deleteCategory: (id) => remove('DELETE FROM supplier_categories WHERE category_id = ?', id, 'category'),
  };
}
