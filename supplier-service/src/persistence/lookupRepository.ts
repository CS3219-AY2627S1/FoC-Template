/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the lookup-table persistence interface per Phase 2 plan Task 4 (Arch §6.4, §7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
export interface FacultyRecord {
  faculty_id: number;
  faculty: string;
}
export interface LocationRecord {
  location_id: number;
  location: string;
  faculty_id: number;
  level: number;
}
export interface CategoryRecord {
  category_id: number;
  category_type: string;
}
export interface LocationPatch {
  location?: string;
  facultyId?: number;
  level?: number;
}

/**
 * Writes to the three lookup tables (Arch §6.4, §7). Foreign-key and UNIQUE violations surface as
 * AppError 422; update returns null and delete returns false when the id does not exist.
 */
export interface LookupRepository {
  createFaculty(faculty: string): Promise<FacultyRecord>;
  updateFaculty(id: number, faculty: string): Promise<FacultyRecord | null>;
  deleteFaculty(id: number): Promise<boolean>;
  createLocation(input: { location: string; facultyId: number; level: number }): Promise<LocationRecord>;
  updateLocation(id: number, patch: LocationPatch): Promise<LocationRecord | null>;
  deleteLocation(id: number): Promise<boolean>;
  createCategory(categoryType: string): Promise<CategoryRecord>;
  updateCategory(id: number, categoryType: string): Promise<CategoryRecord | null>;
  deleteCategory(id: number): Promise<boolean>;
}
