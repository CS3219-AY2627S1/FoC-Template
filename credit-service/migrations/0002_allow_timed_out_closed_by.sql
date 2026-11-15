-- AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-18. Scope: lets a hold be
-- closed by ReservationTimedOut, per order-service/docs/order-credit-contract.md on
-- feat/order-service-core. Author review: Reviewed and approved by @phuc
--
-- Never edit this file after it is merged; add a new numbered file instead.

ALTER TABLE credit_reservations DROP CONSTRAINT credit_reservations_closed_by_check;
ALTER TABLE credit_reservations ADD CONSTRAINT credit_reservations_closed_by_check
  CHECK (closed_by IN ('COMPLETED','CANCELLED','EXPIRED','FAILED','TIMED_OUT'));
