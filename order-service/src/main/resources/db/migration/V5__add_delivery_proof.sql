-- Proof of delivery: when the courier handed the item over, and the photo they took.
ALTER TABLE errands
    ADD COLUMN delivered_at TIMESTAMPTZ,
    ADD COLUMN delivery_photo_key VARCHAR(255);
