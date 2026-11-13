ALTER TABLE suppliers ALTER COLUMN image_key TYPE VARCHAR(255);
UPDATE suppliers SET image_key = NULL;
