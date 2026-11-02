-- Per-user nickname on associations (display only; create still uses delivery point id).
ALTER TABLE user_delivery_point
    ADD COLUMN nickname VARCHAR(80);
