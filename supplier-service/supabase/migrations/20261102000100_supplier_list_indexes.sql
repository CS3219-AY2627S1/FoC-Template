-- AI Assistance Disclosure (hwangjihun):
-- Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
-- Scope: Implemented Supplier listing and search indexes.
-- Author review: I validated correctness, and added boundary checks.

-- Supplier list indexes. Both list routes sort by lower(name) with id as a
-- tie-breaker and search three text columns by case-insensitive substring.

BEGIN;

-- Supabase keeps extensions in this schema; plain PostgreSQL has no such schema.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Matches ORDER BY lower(name), id in either direction. The admin list uses
-- the full index; the normal list reads only ACTIVE rows from the partial one.
CREATE INDEX suppliers_name_order_idx
ON supplier_service.suppliers (lower(name), id);

CREATE INDEX suppliers_active_name_order_idx
ON supplier_service.suppliers (lower(name), id)
WHERE status = 'ACTIVE';

-- Trigram indexes serve ILIKE '%term%' for terms of three or more characters.
-- The list query ORs the three columns, so the planner combines these indexes.
CREATE INDEX suppliers_name_trgm_idx
ON supplier_service.suppliers USING gin (name extensions.gin_trgm_ops);

CREATE INDEX suppliers_building_area_trgm_idx
ON supplier_service.suppliers USING gin (building_area extensions.gin_trgm_ops);

CREATE INDEX suppliers_pickup_location_trgm_idx
ON supplier_service.suppliers USING gin (pickup_location_description extensions.gin_trgm_ops);

COMMIT;
