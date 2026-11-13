-- ============================================================
-- Credit reconciliation: find Order commands to Credit that have
-- no recorded outcome. The check looks each command's operationId
-- up in the inbox, so index it there.
-- ============================================================

CREATE INDEX idx_processed_events_operation
    ON processed_events (operation_id)
    WHERE operation_id IS NOT NULL;
