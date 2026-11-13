-- Historical receipts are intentionally left unbound: guessing an actor/input
-- would authorize an unsafe replay. New writes provide both binding columns.
ALTER TABLE command_receipts ADD COLUMN actor_id varchar(128);
ALTER TABLE command_receipts ADD COLUMN input_fingerprint varchar(64);
