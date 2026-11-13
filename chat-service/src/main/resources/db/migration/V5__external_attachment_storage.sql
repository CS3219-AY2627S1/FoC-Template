ALTER TABLE chat_attachments ADD COLUMN storage_provider VARCHAR(16) NOT NULL DEFAULT 'DATABASE';
ALTER TABLE chat_attachments ADD COLUMN object_key VARCHAR(768);
ALTER TABLE chat_attachments ADD COLUMN checksum_sha256 VARCHAR(64);
ALTER TABLE chat_attachments ALTER COLUMN content DROP NOT NULL;

ALTER TABLE chat_attachments ADD CONSTRAINT chk_chat_attachment_storage CHECK (
    (storage_provider = 'DATABASE' AND content IS NOT NULL AND object_key IS NULL)
    OR (storage_provider = 'S3' AND content IS NULL AND object_key IS NOT NULL)
);
ALTER TABLE chat_attachments ADD CONSTRAINT chk_chat_attachment_checksum CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
);
CREATE UNIQUE INDEX uq_chat_attachment_object_key
    ON chat_attachments(object_key) WHERE object_key IS NOT NULL;
