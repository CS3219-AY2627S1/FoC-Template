CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(32) NOT NULL,
    building VARCHAR(255) NOT NULL,
    floor VARCHAR(32),
    location_description VARCHAR(500),
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    image_key VARCHAR(64),
    active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_active_name ON suppliers (active, name);

-- One row per day display when the supplier opens that day. if the day do not have a row means close that day.
CREATE TABLE IF NOT EXISTS supplier_opening_hours (
    id UUID PRIMARY KEY,
    supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    opens_at TIME NOT NULL,
    closes_at TIME NOT NULL,
    CHECK (opens_at <> closes_at),
    UNIQUE (supplier_id, day_of_week)
);
