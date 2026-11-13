-- A delivery can have several photos (up to 5), submitted together by the courier.
CREATE TABLE delivery_photos (
    id         UUID PRIMARY KEY,
    errand_id  UUID         NOT NULL REFERENCES errands (id) ON DELETE CASCADE,
    photo_key  VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL
);

CREATE INDEX delivery_photos_errand_idx ON delivery_photos (errand_id, created_at);

-- Keep photos taken before this change.
INSERT INTO delivery_photos (id, errand_id, photo_key, created_at)
SELECT gen_random_uuid(), id, delivery_photo_key, COALESCE(delivered_at, updated_at)
FROM errands
WHERE delivery_photo_key IS NOT NULL;

ALTER TABLE errands DROP COLUMN delivery_photo_key;
