/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Defined the persistence interface the business layer depends on, as required by
 *        SupplierServiceArchitecture.md §5 and SupplierServiceSpec.md Phase 0/1. Read operations
 *        only; the visibility rule (§7) is part of every query. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): updated the `dayOfWeek` comment to the
 *        1–7 plus reserved-8 convention (SupplierServiceArchitecture.md §6.2). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): added AdminSupplierRow and the admin
 *        read operations per Phase 2 plan Task 3 (Arch §7). No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review: Congchen
  * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): returned location_id, faculty_id and categories as {category, category_id} objects in supplier responses. Per the team's
 *        decision in chat; no other requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review: Congchen
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added the supplierIds criterion and findStatusesByIds, per the 2026-11-05 supplier-bookmarking spec.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

export interface SupplierRow {
  supplierId: number;
  name: string;
  type: 'Store' | 'Facility';
  desc: string | null;
  locationId: number;
  location: string;
  facultyId: number;
  faculty: string;
  level: number;
}

export interface AdminSupplierRow extends SupplierRow {
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string; // 'YYYY-MM-DDTHH:MM:SS+08:00'
  createdBy: string;
  updatedOn: string;
  version: number;
}

export interface CategoryLinkRow {
  supplierId: number;
  categoryId: number;
  category: string;
}

export interface HourRow {
  supplierId: number;
  dayOfWeek: number; // 1 = Monday .. 7 = Sunday; 8 = open 24/7 (§6.2)
  open: string; // 'HH:MM'
  close: string; // 'HH:MM'
}

export interface PhotoRow {
  supplierId: number;
  photoId: number;
  photoLocation: string;
  displayOrder: number;
}

export interface LocationRow {
  locationId: number;
  location: string;
  facultyId: number;
  faculty: string;
}

export interface CategoryRow {
  categoryId: number;
  category: string;
}

export interface ListCriteria {
  search?: string;
  locationId?: number;
  categoryId?: number;
  supplierIds?: number[];
  sortOrder: 'A-Z' | 'Z-A';
}

export interface ListFilter extends ListCriteria {
  limit: number;
  offset: number;
}

export interface SupplierStatusRow {
  supplierId: number;
  isActive: boolean;
  isDeleted: boolean;
}

export interface SupplierRepository {
  /** User-facing page: only suppliers with is_deleted = false AND is_active = true. */
  findVisiblePage(filter: ListFilter): Promise<{ rows: SupplierRow[]; total: number }>;
  /**
   * Same visibility rule and criteria, no paging. Used when the computed isOpen filter must be
   * applied to the whole result set before a page is cut.
   */
  findAllVisible(criteria: ListCriteria): Promise<SupplierRow[]>;
  /** Same visibility rule; null when the id is missing, deleted, or inactive. */
  findVisibleById(supplierId: number): Promise<SupplierRow | null>;
  /** Admin reads: no visibility filter (Arch §7). */
  findAdminPage(filter: ListFilter): Promise<{ rows: AdminSupplierRow[]; total: number }>;
  findAllAdmin(criteria: ListCriteria): Promise<AdminSupplierRow[]>;
  findAdminById(supplierId: number): Promise<AdminSupplierRow | null>;
  /** Visibility flags for the ids that exist, regardless of state. Missing ids are simply absent. */
  findStatusesByIds(supplierIds: number[]): Promise<SupplierStatusRow[]>;
  findCategoryLinks(supplierIds: number[]): Promise<CategoryLinkRow[]>;
  findHours(supplierIds: number[]): Promise<HourRow[]>;
  findPhotos(supplierIds: number[]): Promise<PhotoRow[]>;
  listLocations(): Promise<LocationRow[]>;
  listCategories(): Promise<CategoryRow[]>;
}
