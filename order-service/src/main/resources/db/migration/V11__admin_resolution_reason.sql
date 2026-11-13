-- Optional for historical resolutions and existing API clients.
ALTER TABLE orders ADD COLUMN admin_resolution_reason varchar(1000);
