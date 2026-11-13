ALTER TABLE suppliers
    ADD COLUMN image_object_key VARCHAR(768),
    ADD COLUMN image_content_type VARCHAR(32);

ALTER TABLE suppliers
    ADD CONSTRAINT chk_supplier_image_storage_metadata CHECK (
        (image_object_key IS NULL AND image_content_type IS NULL)
        OR (image_object_key IS NOT NULL AND image_content_type IS NOT NULL)
    ),
    ADD CONSTRAINT chk_supplier_single_image_source CHECK (
        NOT (image_url IS NOT NULL AND image_object_key IS NOT NULL)
    ),
    ADD CONSTRAINT chk_supplier_image_content_type CHECK (
        image_content_type IS NULL
        OR image_content_type IN ('image/jpeg', 'image/png', 'image/webp')
    );

CREATE UNIQUE INDEX uq_supplier_image_object_key
    ON suppliers (image_object_key)
    WHERE image_object_key IS NOT NULL;
