CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    building VARCHAR(255) NOT NULL,
    floor VARCHAR(20),
    location_description TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    opening_time TIME WITHOUT TIME ZONE,
    closing_time TIME WITHOUT TIME ZONE,
    image_url TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT suppliers_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT suppliers_type_not_blank CHECK (btrim(type) <> ''),
    CONSTRAINT suppliers_building_not_blank CHECK (btrim(building) <> ''),
    CONSTRAINT suppliers_latitude_in_range CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT suppliers_longitude_in_range CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT suppliers_status_valid CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT suppliers_version_nonnegative CHECK (version >= 0)
);

CREATE INDEX idx_suppliers_type ON suppliers (type);
CREATE INDEX idx_suppliers_building ON suppliers (building);
CREATE INDEX idx_suppliers_status ON suppliers (status);
