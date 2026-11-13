-- Existing pending rows are immediately eligible; confirmed progress is never reset.
ALTER TABLE admin_case_outbox ADD COLUMN attempts BIGINT NOT NULL DEFAULT 0;
ALTER TABLE admin_case_outbox ADD COLUMN next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE admin_case_outbox ADD COLUMN last_error VARCHAR(48);

-- A delivery-only coordinator, independent of case/permission mutation locks.
CREATE TABLE admin_case_event_relay (id INTEGER PRIMARY KEY CHECK (id = 1));
INSERT INTO admin_case_event_relay(id) VALUES (1);

CREATE FUNCTION preserve_case_event_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.event_id,NEW.case_id,NEW.source_sequence,NEW.event_type,NEW.topic,NEW.payload,NEW.created_at)
       IS DISTINCT FROM ROW(OLD.event_id,OLD.case_id,OLD.source_sequence,OLD.event_type,OLD.topic,OLD.payload,OLD.created_at) THEN
        RAISE EXCEPTION 'Stored case event identity and payload are immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_case_event BEFORE UPDATE ON admin_case_outbox
    FOR EACH ROW EXECUTE FUNCTION preserve_case_event_identity();
