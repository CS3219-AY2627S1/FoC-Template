CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    requester_id TEXT NOT NULL,
    courier_id TEXT,
    supplier_id TEXT NOT NULL,
    delivery_location TEXT NOT NULL,
    needed_by_time TIMESTAMPTZ NOT NULL,
    item_lines TEXT[] NOT NULL,
    credit_reward INTEGER NOT NULL CHECK (credit_reward BETWEEN 1 AND 50),
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Open', 'Accepted', 'PickedUp', 'Delivered', 'Completed', 'Cancelled', 'Expired', 'Rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Where the walk starts (the supplier) and ends (the drop-off point picked on the map), and the walk
-- the supplier-service measured between them when the errand was created. Errands from before have
-- none, and the route stays empty when the supplier-service could not measure it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_longitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_longitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_metres INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_seconds INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_estimated BOOLEAN;

-- Databases created before Rejected existed keep the old check, so it is replaced on every start.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('Pending', 'Open', 'Accepted', 'PickedUp', 'Delivered', 'Completed', 'Cancelled', 'Expired', 'Rejected'));

CREATE TABLE IF NOT EXISTS order_outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    data JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ
);

-- Several instances relay at once; an instance claims a batch until this time so no other one sends it too.
ALTER TABLE order_outbox ADD COLUMN IF NOT EXISTS claimed_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS order_outbox_pending ON order_outbox (occurred_at) WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS order_transitions (
    id BIGSERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders (id),
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_transitions_by_order ON order_transitions (order_id, occurred_at, id);

CREATE INDEX IF NOT EXISTS orders_open_by_needed_by ON orders (needed_by_time) WHERE status = 'Open';
