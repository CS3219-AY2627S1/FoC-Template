/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Transcribed the team-provided Phase 0 Task 3 supplier schema DDL verbatim.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): `supplier_hours` now has `is_24h` and
 *        `day_of_week` 1–8, per SupplierServiceArchitecture.md §6.4 and §9 item 21. The lookup
 *        foreign keys now state `ON DELETE RESTRICT` explicitly (MySQL's default already). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added the `outbox` table as the last
 *        statement, DDL as fixed by the team (Phase 4 plan Task 3). No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */

CREATE TABLE IF NOT EXISTS faculties (faculty_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, faculty VARCHAR(255) NOT NULL, PRIMARY KEY (faculty_id), UNIQUE KEY uq_faculties_faculty (faculty));
CREATE TABLE IF NOT EXISTS supplier_locations (location_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, location VARCHAR(255) NOT NULL, faculty_id BIGINT UNSIGNED NOT NULL, level INT NOT NULL, PRIMARY KEY (location_id), UNIQUE KEY uq_supplier_locations (location, faculty_id, level), CONSTRAINT fk_supplier_locations_faculty FOREIGN KEY (faculty_id) REFERENCES faculties (faculty_id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS supplier (supplier_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, supplier_name VARCHAR(255) NOT NULL, supplier_type ENUM('Store', 'Facility') NOT NULL, supplier_desc TEXT NULL, location_id BIGINT UNSIGNED NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE, is_deleted BOOLEAN NOT NULL DEFAULT FALSE, created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(255) NOT NULL, updated_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, version BIGINT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (supplier_id), UNIQUE KEY uq_supplier_name_type_location (supplier_name, supplier_type, location_id), KEY idx_supplier_location (location_id), KEY idx_supplier_visibility (is_active, is_deleted), CONSTRAINT fk_supplier_location FOREIGN KEY (location_id) REFERENCES supplier_locations (location_id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS supplier_categories (category_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, category_type VARCHAR(100) NOT NULL, PRIMARY KEY (category_id), UNIQUE KEY uq_supplier_categories_type (category_type));
CREATE TABLE IF NOT EXISTS supplier_category_map (supplier_id BIGINT UNSIGNED NOT NULL, category_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (supplier_id, category_id), CONSTRAINT fk_supplier_category_map_supplier FOREIGN KEY (supplier_id) REFERENCES supplier (supplier_id), CONSTRAINT fk_supplier_category_map_category FOREIGN KEY (category_id) REFERENCES supplier_categories (category_id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS supplier_hours (entry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, supplier_id BIGINT UNSIGNED NOT NULL, day_of_week TINYINT UNSIGNED NOT NULL, open_time TIME NOT NULL, close_time TIME NOT NULL, is_24h BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (entry_id), UNIQUE KEY uq_supplier_hours_day (supplier_id, day_of_week), CONSTRAINT chk_supplier_hours_day CHECK (day_of_week BETWEEN 1 AND 8), CONSTRAINT fk_supplier_hours_supplier FOREIGN KEY (supplier_id) REFERENCES supplier (supplier_id));
CREATE TABLE IF NOT EXISTS supplier_photos (photo_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, supplier_id BIGINT UNSIGNED NOT NULL, photo_location VARCHAR(2048) NOT NULL, display_order INT UNSIGNED NOT NULL, PRIMARY KEY (photo_id), UNIQUE KEY uq_supplier_photos_order (supplier_id, display_order), CONSTRAINT fk_supplier_photos_supplier FOREIGN KEY (supplier_id) REFERENCES supplier (supplier_id));
CREATE TABLE IF NOT EXISTS dead_letter_jobs (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, job_id VARCHAR(255) NOT NULL, task_name VARCHAR(255) NOT NULL, payload JSON NOT NULL, error_trace TEXT NOT NULL, failed_at DATETIME NOT NULL, status VARCHAR(50) NOT NULL DEFAULT 'UNRESOLVED', PRIMARY KEY (id), KEY idx_dead_letter_jobs_status (status));
CREATE TABLE IF NOT EXISTS outbox (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, task_name VARCHAR(255) NOT NULL, payload JSON NOT NULL, version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (id));
