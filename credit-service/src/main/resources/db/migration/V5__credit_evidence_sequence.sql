ALTER TABLE credit_outbox_events ADD COLUMN evidence_sequence BIGINT;

WITH numbered AS (
  SELECT event_id, row_number() OVER(PARTITION BY aggregate_id ORDER BY created_at,event_id) AS sequence
  FROM credit_outbox_events WHERE aggregate_type='Order'
)
UPDATE credit_outbox_events e SET evidence_sequence=n.sequence FROM numbered n WHERE e.event_id=n.event_id;

CREATE UNIQUE INDEX uq_credit_evidence_sequence
  ON credit_outbox_events(aggregate_id,evidence_sequence)
  WHERE aggregate_type='Order';

CREATE OR REPLACE FUNCTION assign_credit_evidence_sequence() RETURNS trigger AS $$
BEGIN
  IF NEW.aggregate_type='Order' AND NEW.evidence_sequence IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.aggregate_id::text));
    SELECT COALESCE(MAX(evidence_sequence),0)+1 INTO NEW.evidence_sequence
      FROM credit_outbox_events WHERE aggregate_type='Order' AND aggregate_id=NEW.aggregate_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_credit_evidence_sequence BEFORE INSERT ON credit_outbox_events
FOR EACH ROW EXECUTE FUNCTION assign_credit_evidence_sequence();
