-- AI Assistance Disclosure (hwangjihun):
-- Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23
-- Scope: Generated Supplier SQL constraints, normalization functions and triggers.
-- Author review: I validated correctness, and added boundary checks.

-- D2 Supplier Service step 1: supplier-owned PostgreSQL schema.
-- Apply this migration only to the Supplier Service database.

BEGIN;

CREATE SCHEMA supplier_service;

CREATE TYPE supplier_service.supplier_status AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE supplier_service.categories (
    code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
    display_name text NOT NULL CHECK (display_name ~ '[^[:space:]]')
);

INSERT INTO supplier_service.categories (code, display_name) VALUES
    ('FOOD', 'Food'),
    ('COFFEE', 'Coffee'),
    ('SHOPPING', 'Shopping'),
    ('PRINTING', 'Printing'),
    ('LANDMARK', 'Landmark'),
    ('OTHERS', 'Others');

CREATE FUNCTION supplier_service.normalize_identity_component(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
    SELECT lower(btrim(regexp_replace(value, '[[:space:]]+', ' ', 'g')));
$$;

CREATE TABLE supplier_service.suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL
        CHECK (supplier_service.normalize_identity_component(name) <> ''),
    building_area text NOT NULL
        CHECK (supplier_service.normalize_identity_component(building_area) <> ''),
    pickup_location_description text NOT NULL
        CHECK (supplier_service.normalize_identity_component(pickup_location_description) <> ''),
    floor text,
    latitude numeric(12, 9),
    longitude numeric(12, 9),
    opening_time time without time zone,
    closing_time time without time zone,
    image_url text,
    status supplier_service.supplier_status NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT suppliers_coordinate_pair CHECK (
        (latitude IS NULL) = (longitude IS NULL)
    ),
    CONSTRAINT suppliers_latitude_range CHECK (
        latitude IS NULL OR latitude BETWEEN -90 AND 90
    ),
    CONSTRAINT suppliers_longitude_range CHECK (
        longitude IS NULL OR longitude BETWEEN -180 AND 180
    ),
    CONSTRAINT suppliers_operating_time_pair CHECK (
        (opening_time IS NULL) = (closing_time IS NULL)
    )
);

COMMENT ON COLUMN supplier_service.suppliers.opening_time IS
    'Recurring opening time in Asia/Singapore local time';
COMMENT ON COLUMN supplier_service.suppliers.closing_time IS
    'Recurring closing time in Asia/Singapore local time';

CREATE TABLE supplier_service.supplier_categories (
    supplier_id uuid NOT NULL
        REFERENCES supplier_service.suppliers (id) ON DELETE CASCADE,
    category_code text NOT NULL
        REFERENCES supplier_service.categories (code) ON DELETE RESTRICT,
    PRIMARY KEY (supplier_id, category_code)
);

-- The backend inserts a supplier and its categories in one transaction.
-- The deferred checks reject a supplier with no categories at commit.
CREATE INDEX supplier_categories_category_supplier_idx
ON supplier_service.supplier_categories (category_code, supplier_id);

CREATE FUNCTION supplier_service.require_supplier_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    checked_supplier_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'suppliers' THEN
        checked_supplier_id := NEW.id;
    ELSE
        checked_supplier_id := OLD.supplier_id;
    END IF;

    PERFORM 1 FROM supplier_service.suppliers
    WHERE id = checked_supplier_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM supplier_service.supplier_categories
        WHERE supplier_id = checked_supplier_id
    ) THEN
        RAISE EXCEPTION 'supplier % must have at least one category', checked_supplier_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER suppliers_require_category_after_insert
AFTER INSERT ON supplier_service.suppliers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION supplier_service.require_supplier_category();

CREATE CONSTRAINT TRIGGER suppliers_require_category_after_removal
AFTER UPDATE OR DELETE ON supplier_service.supplier_categories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION supplier_service.require_supplier_category();

CREATE FUNCTION supplier_service.guard_supplier_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'supplier id cannot be changed';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'supplier creation timestamp cannot be changed';
    END IF;
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER suppliers_guard_update
BEFORE UPDATE ON supplier_service.suppliers
FOR EACH ROW
EXECUTE FUNCTION supplier_service.guard_supplier_update();

-- Categories are part of a supplier record, so changing an assignment must
-- also refresh that supplier's last-updated timestamp.
CREATE FUNCTION supplier_service.touch_supplier_on_category_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_supplier_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.supplier_id IS DISTINCT FROM NEW.supplier_id THEN
            UPDATE supplier_service.suppliers
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = OLD.supplier_id;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        target_supplier_id := OLD.supplier_id;
    ELSE
        target_supplier_id := NEW.supplier_id;
    END IF;

    UPDATE supplier_service.suppliers
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = target_supplier_id;

    RETURN NULL;
END;
$$;

CREATE TRIGGER supplier_categories_touch_supplier
AFTER INSERT OR UPDATE OR DELETE ON supplier_service.supplier_categories
FOR EACH ROW
EXECUTE FUNCTION supplier_service.touch_supplier_on_category_change();

-- Applies to ACTIVE and INACTIVE rows. A unique index settles concurrent
-- duplicate inserts or updates atomically.
CREATE UNIQUE INDEX suppliers_normalized_identity_unique
ON supplier_service.suppliers (
    supplier_service.normalize_identity_component(name),
    supplier_service.normalize_identity_component(building_area),
    COALESCE(supplier_service.normalize_identity_component(floor), '')
);

COMMIT;
