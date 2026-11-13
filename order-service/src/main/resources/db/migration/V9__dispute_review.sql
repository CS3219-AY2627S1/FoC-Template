ALTER TABLE orders ADD COLUMN review_case_id UUID;
ALTER TABLE orders ADD COLUMN review_resolution_id UUID;
ALTER TABLE orders ADD COLUMN review_disposition VARCHAR(32);
ALTER TABLE orders ADD COLUMN review_resolved_at TIMESTAMPTZ;
ALTER TABLE orders ADD CONSTRAINT chk_order_review_shape CHECK (
    (review_case_id IS NULL AND review_resolution_id IS NULL AND review_disposition IS NULL AND review_resolved_at IS NULL)
    OR (review_case_id IS NOT NULL AND ((review_resolution_id IS NULL AND review_disposition IS NULL AND review_resolved_at IS NULL)
      OR (review_resolution_id IS NOT NULL AND review_disposition IN ('RETURN_TO_REQUESTER','PAY_COURIER','KEEP_EXISTING'))))
);

-- A dispute may finish before any courier has accepted. Keep the ordinary assignment invariant.
ALTER TABLE orders DROP CONSTRAINT chk_courier_assignment;
ALTER TABLE orders ADD CONSTRAINT chk_courier_assignment CHECK (
    (state IN ('ACCEPTED','PICKED_UP','DELIVERED','COMPLETED') AND courier_id IS NOT NULL)
    OR (state NOT IN ('ACCEPTED','PICKED_UP','DELIVERED','COMPLETED') AND courier_id IS NULL)
    OR (state='COMPLETED' AND courier_id IS NULL AND review_case_id IS NOT NULL
        AND review_resolved_at IS NOT NULL AND terminal_reason='DISPUTE_RESOLVED')
);
