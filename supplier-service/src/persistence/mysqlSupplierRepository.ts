/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: MySQL implementation of the Phase 1 read operations over the schema in
 *        SupplierServiceArchitecture.md §6.4: visibility rule (§7), name/location/category search
 *        excluding supplier_desc (§6.3), location/category filters, A-Z/Z-A sort and fixed-size
 *        paging (§7.2). No requirements, architecture, schema, or API decisions were made by the AI
 *        tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added the admin read queries (no
 *        visibility filter) per Phase 2 plan Task 3. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: Congchen
  * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): returned location_id, faculty_id and categories as {category, category_id} objects in supplier responses. Per the team's
 *        decision in chat; no other requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review: Congchen
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added the supplierIds criterion and findStatusesByIds, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  AdminSupplierRow,
  CategoryLinkRow,
  CategoryRow,
  HourRow,
  ListFilter,
  LocationRow,
  PhotoRow,
  SupplierRepository,
  SupplierRow,
  SupplierStatusRow,
} from './supplierRepository.js';

interface SupplierDbRow extends RowDataPacket {
  supplier_id: number;
  supplier_name: string;
  supplier_type: 'Store' | 'Facility';
  supplier_desc: string | null;
  location_id: number;
  location: string;
  faculty_id: number;
  faculty: string;
  level: number;
}

const SUPPLIER_COLUMNS = `
  s.supplier_id, s.supplier_name, s.supplier_type, s.supplier_desc,
  s.location_id, l.location, f.faculty_id, f.faculty, l.level`;

const SUPPLIER_FROM = `
  FROM supplier s
  JOIN supplier_locations l ON l.location_id = s.location_id
  JOIN faculties f ON f.faculty_id = l.faculty_id`;

interface StatusDbRow extends RowDataPacket {
  supplier_id: number;
  is_active: number;
  is_deleted: number;
}

interface AdminDbRow extends SupplierDbRow {
  is_active: number;
  is_deleted: number;
  created_on: string;
  created_by: string;
  updated_on: string;
  version: number;
}

// created_on / updated_on are stored as Singapore wall-clock time (Arch §6.2).
const ADMIN_COLUMNS = `${SUPPLIER_COLUMNS},
  s.is_active, s.is_deleted, s.created_by, s.version,
  DATE_FORMAT(s.created_on, '%Y-%m-%dT%H:%i:%s+08:00') AS created_on,
  DATE_FORMAT(s.updated_on, '%Y-%m-%dT%H:%i:%s+08:00') AS updated_on`;

const VISIBLE = 's.is_deleted = FALSE AND s.is_active = TRUE';

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildWhere(
  filter: Pick<ListFilter, 'search' | 'locationId' | 'categoryId' | 'supplierIds'>,
  visibleOnly = true,
): { where: string; params: Array<string | number | number[]> } {
  const conditions = visibleOnly ? [VISIBLE] : ['1 = 1'];
  const params: Array<string | number | number[]> = [];

  if (filter.supplierIds !== undefined) {
    conditions.push('s.supplier_id IN (?)');
    params.push(filter.supplierIds);
  }

  if (filter.locationId !== undefined) {
    conditions.push('s.location_id = ?');
    params.push(filter.locationId);
  }
  if (filter.categoryId !== undefined) {
    conditions.push(
      `EXISTS (SELECT 1 FROM supplier_category_map cm
               WHERE cm.supplier_id = s.supplier_id AND cm.category_id = ?)`,
    );
    params.push(filter.categoryId);
  }
  if (filter.search !== undefined && filter.search !== '') {
    const pattern = `%${escapeLike(filter.search.toLowerCase())}%`;
    conditions.push(
      `(LOWER(s.supplier_name) LIKE ?
        OR LOWER(l.location) LIKE ?
        OR EXISTS (SELECT 1 FROM supplier_category_map cm2
                   JOIN supplier_categories c ON c.category_id = cm2.category_id
                   WHERE cm2.supplier_id = s.supplier_id AND LOWER(c.category_type) LIKE ?))`,
    );
    params.push(pattern, pattern, pattern);
  }

  return { where: conditions.join(' AND '), params };
}

function toSupplierRow(row: SupplierDbRow): SupplierRow {
  return {
    supplierId: Number(row.supplier_id),
    name: row.supplier_name,
    type: row.supplier_type,
    desc: row.supplier_desc,
    locationId: Number(row.location_id),
    location: row.location,
    facultyId: Number(row.faculty_id),
    faculty: row.faculty,
    level: Number(row.level),
  };
}

function toAdminRow(row: AdminDbRow): AdminSupplierRow {
  return {
    ...toSupplierRow(row),
    isActive: Boolean(row.is_active),
    isDeleted: Boolean(row.is_deleted),
    createdOn: row.created_on,
    createdBy: row.created_by,
    updatedOn: row.updated_on,
    version: Number(row.version),
  };
}

export function createMysqlSupplierRepository(pool: Pool): SupplierRepository {
  return {
    async findVisiblePage(filter) {
      const { where, params } = buildWhere(filter);
      const direction = filter.sortOrder === 'Z-A' ? 'DESC' : 'ASC';

      const countPromise = pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total ${SUPPLIER_FROM} WHERE ${where}`,
        params,
      );
      const pagePromise = pool.query<SupplierDbRow[]>(
        `SELECT ${SUPPLIER_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC
         LIMIT ? OFFSET ?`,
        [...params, filter.limit, filter.offset],
      );
      const [[countRows], [pageRows]] = await Promise.all([countPromise, pagePromise]);

      return {
        rows: pageRows.map(toSupplierRow),
        total: Number(countRows[0]?.total ?? 0),
      };
    },

    async findAllVisible(criteria) {
      const { where, params } = buildWhere(criteria);
      const direction = criteria.sortOrder === 'Z-A' ? 'DESC' : 'ASC';
      const [rows] = await pool.query<SupplierDbRow[]>(
        `SELECT ${SUPPLIER_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC`,
        params,
      );
      return rows.map(toSupplierRow);
    },

    async findVisibleById(supplierId) {
      const [rows] = await pool.query<SupplierDbRow[]>(
        `SELECT ${SUPPLIER_COLUMNS} ${SUPPLIER_FROM} WHERE ${VISIBLE} AND s.supplier_id = ?`,
        [supplierId],
      );
      const row = rows[0];
      return row === undefined ? null : toSupplierRow(row);
    },

    async findAdminPage(filter) {
      const { where, params } = buildWhere(filter, false);
      const direction = filter.sortOrder === 'Z-A' ? 'DESC' : 'ASC';
      const countPromise = pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total ${SUPPLIER_FROM} WHERE ${where}`,
        params,
      );
      const pagePromise = pool.query<AdminDbRow[]>(
        `SELECT ${ADMIN_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC
         LIMIT ? OFFSET ?`,
        [...params, filter.limit, filter.offset],
      );
      const [[countRows], [pageRows]] = await Promise.all([countPromise, pagePromise]);
      return { rows: pageRows.map(toAdminRow), total: Number(countRows[0]?.total ?? 0) };
    },

    async findAllAdmin(criteria) {
      const { where, params } = buildWhere(criteria, false);
      const direction = criteria.sortOrder === 'Z-A' ? 'DESC' : 'ASC';
      const [rows] = await pool.query<AdminDbRow[]>(
        `SELECT ${ADMIN_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC`,
        params,
      );
      return rows.map(toAdminRow);
    },

    async findAdminById(supplierId) {
      const [rows] = await pool.query<AdminDbRow[]>(
        `SELECT ${ADMIN_COLUMNS} ${SUPPLIER_FROM} WHERE s.supplier_id = ?`,
        [supplierId],
      );
      const row = rows[0];
      return row === undefined ? null : toAdminRow(row);
    },

    async findStatusesByIds(supplierIds) {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<StatusDbRow[]>(
        `SELECT supplier_id, is_active, is_deleted FROM supplier WHERE supplier_id IN (?)`,
        [supplierIds],
      );
      return rows.map(
        (row): SupplierStatusRow => ({
          supplierId: Number(row.supplier_id),
          isActive: Boolean(row.is_active),
          isDeleted: Boolean(row.is_deleted),
        }),
      );
    },

    async findCategoryLinks(supplierIds): Promise<CategoryLinkRow[]> {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT cm.supplier_id, cm.category_id, c.category_type
         FROM supplier_category_map cm
         JOIN supplier_categories c ON c.category_id = cm.category_id
         WHERE cm.supplier_id IN (?)
         ORDER BY cm.supplier_id, c.category_type`,
        [supplierIds],
      );
      return rows.map((row) => ({
        supplierId: Number(row.supplier_id),
        categoryId: Number(row.category_id),
        category: String(row.category_type),
      }));
    },

    async findHours(supplierIds): Promise<HourRow[]> {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, day_of_week, open_time, close_time
         FROM supplier_hours
         WHERE supplier_id IN (?)
         ORDER BY supplier_id, day_of_week`,
        [supplierIds],
      );
      return rows.map((row) => ({
        supplierId: Number(row.supplier_id),
        dayOfWeek: Number(row.day_of_week),
        open: String(row.open_time).slice(0, 5),
        close: String(row.close_time).slice(0, 5),
      }));
    },

    async findPhotos(supplierIds): Promise<PhotoRow[]> {
      if (supplierIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, photo_id, photo_location, display_order
         FROM supplier_photos
         WHERE supplier_id IN (?)
         ORDER BY supplier_id, display_order`,
        [supplierIds],
      );
      return rows.map((row) => ({
        supplierId: Number(row.supplier_id),
        photoId: Number(row.photo_id),
        photoLocation: String(row.photo_location),
        displayOrder: Number(row.display_order),
      }));
    },

    async listLocations(): Promise<LocationRow[]> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT l.location_id, l.location, l.faculty_id, f.faculty
         FROM supplier_locations l
         JOIN faculties f ON f.faculty_id = l.faculty_id
         ORDER BY f.faculty, l.location, l.level`,
      );
      return rows.map((row) => ({
        locationId: Number(row.location_id),
        location: String(row.location),
        facultyId: Number(row.faculty_id),
        faculty: String(row.faculty),
      }));
    },

    async listCategories(): Promise<CategoryRow[]> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT category_id, category_type FROM supplier_categories ORDER BY category_type`,
      );
      return rows.map((row) => ({
        categoryId: Number(row.category_id),
        category: String(row.category_type),
      }));
    },
  };
}
