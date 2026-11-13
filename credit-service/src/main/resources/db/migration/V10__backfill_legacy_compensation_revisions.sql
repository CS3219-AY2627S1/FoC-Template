/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Database migration implementation assistance.
 * Scope: Added selective legacy revision evidence for safe Credit compensation.
 * Author review: I reviewed for correctness
 */

-- V9 introduced mutation revisions after existing reservations had already been
-- created. Revision one is the migration-time baseline for those legacy rows;
-- every later mutation continues to advance it monotonically.
update credit_reservations
set mutation_revision = 1
where mutation_revision = 0;

-- A legacy reserve can be attributed to its command only while the exact hold is
-- still active and unassigned. Assigned, settled, mismatched, or superseded rows
-- deliberately retain a null effect_revision and require reconciliation.
update credit_command_records command
set effect_revision = reservation.mutation_revision
from credit_reservations reservation
where command.effect_revision is null
  and command.operation = 'RESERVE'
  and command.outcome = 'APPLIED'
  and command.order_id = reservation.order_id
  and command.actor_id = reservation.requester_id
  and command.amount = reservation.amount
  and command.command_id = reservation.reserve_command_id
  and reservation.status = 'RESERVED'
  and reservation.courier_id is null;

-- Matching the courier alone is insufficient because a clear/reassign cycle may
-- return to the same UID. Both persisted command identities must still name K.
update credit_command_records command
set effect_revision = reservation.mutation_revision
from credit_reservations reservation
where command.effect_revision is null
  and command.operation = 'ASSIGN_COURIER'
  and command.outcome = 'APPLIED'
  and command.order_id = reservation.order_id
  and command.actor_id = reservation.courier_id
  and command.command_id = reservation.courier_assignment_command_id
  and command.command_id = reservation.courier_assignment_identity
  and reservation.status = 'RESERVED';

-- Historical CLEAR_COURIER rows remain untouched: V8 and earlier did not retain
-- the prior courier, assignment identity, and revision needed for safe restore.
