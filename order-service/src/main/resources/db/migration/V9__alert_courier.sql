-- Couriers need the dispute lifecycle in GET /alerts (Escalated, Under review,
-- case-resolved Completed). Same row as the requester alert; flags decide who sees it.
ALTER TABLE alerts
    ADD COLUMN courier_id VARCHAR(320),
    ADD COLUMN notify_courier BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX alerts_courier_id_created_idx
    ON alerts (courier_id, created_at DESC)
    WHERE notify_courier = TRUE;
