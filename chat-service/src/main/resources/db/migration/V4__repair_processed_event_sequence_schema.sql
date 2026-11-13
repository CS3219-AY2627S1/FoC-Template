-- Compatibility repair for local databases created by an early V2 migration which
-- recorded only the event id and payload hash. The current consumer also needs the
-- order-local sequence to reject conflicting lifecycle events deterministically.
ALTER TABLE chat_processed_events
    ADD COLUMN IF NOT EXISTS order_id UUID,
    ADD COLUMN IF NOT EXISTS source_sequence BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'chat_processed_events'::regclass
          AND conname = 'uq_chat_processed_order_sequence'
    ) THEN
        ALTER TABLE chat_processed_events
            ADD CONSTRAINT uq_chat_processed_order_sequence
            UNIQUE (order_id, source_sequence);
    END IF;
END $$;

DO $$
BEGIN
    -- Fresh and affected local databases have no legacy rows, so retain the strict
    -- current schema. If an older environment contains audit rows that cannot be
    -- reconstructed, keep those rows readable while all new writes supply both fields.
    IF NOT EXISTS (
        SELECT 1 FROM chat_processed_events
        WHERE order_id IS NULL OR source_sequence IS NULL
    ) THEN
        ALTER TABLE chat_processed_events
            ALTER COLUMN order_id SET NOT NULL,
            ALTER COLUMN source_sequence SET NOT NULL;
    END IF;
END $$;

ALTER TABLE chat_processed_events
    DROP CONSTRAINT IF EXISTS chk_chat_processed_source_sequence;

ALTER TABLE chat_processed_events
    ADD CONSTRAINT chk_chat_processed_source_sequence CHECK (
        (order_id IS NULL AND source_sequence IS NULL)
        OR (order_id IS NOT NULL AND source_sequence >= 1)
    );
