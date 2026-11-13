CREATE INDEX "user_sessions_revoked_at_idx" ON "user_sessions"("revoked_at");

-- Limit each DELETE statement to keep row locks and WAL bursts small. The loop
-- drains the backlog in one daily run, including sessions revoked before expiry.
CREATE FUNCTION cleanup_user_sessions(batch_size integer DEFAULT 1000)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count integer;
    total_deleted bigint := 0;
BEGIN
    IF batch_size IS NULL OR batch_size < 1 THEN
        RAISE EXCEPTION 'batch_size must be positive';
    END IF;

    LOOP
        WITH stale AS (
            SELECT "id"
            FROM "user_sessions"
            WHERE "expires_at" <= CURRENT_TIMESTAMP OR "revoked_at" IS NOT NULL
            ORDER BY "id"
            LIMIT batch_size
        )
        DELETE FROM "user_sessions" AS sessions
        USING stale
        WHERE sessions."id" = stale."id";

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        total_deleted := total_deleted + deleted_count;
        EXIT WHEN deleted_count = 0;
    END LOOP;

    RETURN total_deleted;
END;
$$;
