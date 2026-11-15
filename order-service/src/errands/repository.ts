/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Atomic errand creation and state transitions (one conditional UPDATE + history +
 *        outbox in one transaction) with failure classification, implementing the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: A non-party's failed accept no longer reveals the errand's current state.
 * Author review: Reviewed and approved by @mattis.
 */
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { loadOrderConfig, TOPICS } from "../config";
import { inTransaction, rollback } from "../db";
import { closingMessagePayload, reserveRequestedPayload } from "../domain/messages";
import type { ErrandState } from "../domain/states";
import { TRANSITIONS, type Action, type TransitionRule } from "../domain/transitions";
import type { CreateErrandInput } from "../domain/validation";
import { insertOutboxEvent } from "../outbox";
import { mapErrandRow, type Actor, type Errand, type SupplierSnapshot } from "./errand";

export type TransitionError = "NOT_FOUND" | "FORBIDDEN" | "CANNOT_ACCEPT_OWN_ERRAND" | "INVALID_STATE" | "DEADLINE_PASSED";

export type TransitionResult =
  | { ok: true; errand: Errand }
  | { ok: false; error: TransitionError; currentState?: ErrandState };

export interface TransitionOptions {
  reason?: string;
  now?: Date;
}

async function insertHistory(
  client: PoolClient,
  h: { errandId: string; from: ErrandState | null; to: ErrandState; action: string; actor: Actor; reason: string | null; at: Date },
): Promise<void> {
  const actorType = h.actor.kind === "user" ? "USER" : h.actor.kind === "system" ? "SYSTEM" : "CREDIT";
  const actorId = h.actor.kind === "user" ? h.actor.id : null;
  await client.query(
    `INSERT INTO errand_history (errand_id, from_state, to_state, action, actor_type, actor_id, reason, at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [h.errandId, h.from, h.to, h.action, actorType, actorId, h.reason, h.at],
  );
}

/** Creates the errand in PENDING_RESERVATION with its history row and ReserveRequested, atomically. */
export async function createErrand(
  pool: Pool,
  requesterId: string,
  input: CreateErrandInput,
  supplier: SupplierSnapshot,
): Promise<Errand> {
  const now = new Date();
  const reservationDeadline = new Date(now.getTime() + loadOrderConfig().reservationTimeoutSeconds * 1000);
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO errands (id, requester_id, supplier_id, supplier_name, supplier_building_code,
                            supplier_location_description, items, dropoff_location, notes, credit_amount,
                            state, reservation_operation_id, reservation_deadline, listing_deadline,
                            pickup_deadline, delivery_deadline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING_RESERVATION', $11, $12, $13, $14, $15, $16, $16)
       RETURNING *`,
      [
        randomUUID(), requesterId, supplier.id, supplier.name, supplier.buildingCode, supplier.locationDescription,
        JSON.stringify(input.items), input.dropoffLocation, input.notes, input.creditAmount,
        randomUUID(), reservationDeadline, input.listingDeadline, input.pickupDeadline, input.deliveryDeadline, now,
      ],
    );
    const errand = mapErrandRow(rows[0]);
    await insertHistory(client, {
      errandId: errand.id, from: null, to: "PENDING_RESERVATION", action: "create",
      actor: { kind: "user", id: requesterId, role: "MEMBER" }, reason: null, at: now,
    });
    await insertOutboxEvent(client, {
      eventType: "ReserveRequested", topic: TOPICS.commands, key: errand.id, payload: reserveRequestedPayload(errand),
    });
    return errand;
  });
}

/**
 * Builds the single conditional UPDATE for `rule`. It changes the row only if the state, the
 * actor's party and the deadline all allow it; its row lock serialises racing transitions.
 */
function buildTransitionUpdate(rule: TransitionRule, errandId: string, actor: Actor, now: Date) {
  const values: unknown[] = [];
  const p = (v: unknown) => {
    values.push(v);
    return `$${values.length}`;
  };
  const actorId = actor.kind === "user" ? actor.id : null;

  const sets = [`state = ${p(rule.to)}::errand_state`, `updated_at = ${p(now)}`];
  if (rule.courier === "assign") sets.push(`courier_id = ${p(actorId)}::uuid`);
  if (rule.courier === "clear") sets.push(`courier_id = NULL`);
  if (rule.stamp) sets.push(`${rule.stamp} = ${p(now)}`);
  if (rule.to === "DELIVERED") {
    const windowMs = loadOrderConfig().confirmationWindowMinutes * 60_000;
    sets.push(`confirm_deadline = ${p(new Date(now.getTime() + windowMs))}`);
  }
  if (rule.closingMessage) sets.push(`closed_at = ${p(now)}`);

  const where = [`id = ${p(errandId)}`, `state = ANY(${p(rule.from)}::errand_state[])`];
  switch (rule.party) {
    case "requester":
      where.push(`requester_id = ${p(actorId)}::uuid`);
      break;
    case "courier":
      where.push(`courier_id = ${p(actorId)}::uuid`);
      break;
    case "nonRequester":
      where.push(`requester_id <> ${p(actorId)}::uuid`);
      break;
    case "admin": {
      const role = actor.kind === "user" ? actor.role : null;
      const id = p(actorId);
      where.push(`${p(role)}::text = 'ADMINISTRATOR' AND requester_id <> ${id}::uuid AND courier_id IS DISTINCT FROM ${id}::uuid`);
      break;
    }
    case "system":
      where.push(`${p(actor.kind)}::text = 'system'`);
      break;
  }
  if (rule.deadline) {
    where.push(`${rule.deadline.column} ${rule.deadline.mustHavePassed ? "<=" : ">"} ${p(now)}`);
  }

  return { text: `UPDATE errands SET ${sets.join(", ")} WHERE ${where.join(" AND ")} RETURNING *`, values };
}

/** The same party test as the UPDATE's WHERE clause, evaluated on a row we read back. */
function partyMatches(rule: TransitionRule, actor: Actor, e: Errand): boolean {
  if (rule.party === "system") return actor.kind === "system";
  if (actor.kind !== "user") return false;
  const id = actor.id.toLowerCase();
  switch (rule.party) {
    case "requester":
      return e.requesterId === id;
    case "courier":
      return e.courierId === id;
    case "nonRequester":
      return e.requesterId !== id;
    case "admin":
      return actor.role === "ADMINISTRATOR" && e.requesterId !== id && e.courierId !== id;
  }
}

/** Why the UPDATE matched no row, checked in the order the plan fixes. */
async function classifyFailure(
  client: PoolClient, rule: TransitionRule, action: Action, errandId: string, actor: Actor,
): Promise<Extract<TransitionResult, { ok: false }>> {
  const { rows } = await client.query(`SELECT * FROM errands WHERE id = $1`, [errandId]);
  if (rows.length === 0) return { ok: false, error: "NOT_FOUND" };
  const e = mapErrandRow(rows[0]);

  if (!partyMatches(rule, actor, e)) {
    if (actor.kind !== "user") return { ok: false, error: "FORBIDDEN" };
    const id = actor.id.toLowerCase();
    if (action === "accept" && e.requesterId === id) return { ok: false, error: "CANNOT_ACCEPT_OWN_ERRAND" };
    const isParty = e.requesterId === id || e.courierId === id;
    // Members only see OPEN errands and their own; anything else must look absent to them
    const partyOrAdminAction = rule.party === "requester" || rule.party === "courier" || rule.party === "admin";
    if (partyOrAdminAction && !isParty && actor.role === "MEMBER" && e.state !== "OPEN") {
      return { ok: false, error: "NOT_FOUND" };
    }
    return { ok: false, error: "FORBIDDEN" };
  }
  if (!rule.from.includes(e.state)) {
    // Anyone may try to accept an OPEN errand, but a non-party must not learn what it became
    const id = actor.kind === "user" ? actor.id.toLowerCase() : null;
    const learnsState = actor.kind !== "user" || actor.role === "ADMINISTRATOR" || e.requesterId === id || e.courierId === id;
    if (action === "accept" && !learnsState) return { ok: false, error: "INVALID_STATE" };
    return { ok: false, error: "INVALID_STATE", currentState: e.state };
  }
  // The state and party clauses hold, so the deadline clause failed
  return { ok: false, error: "DEADLINE_PASSED" };
}

/**
 * Applies `action` inside the caller's transaction. On success the errand row, a history row
 * and (for closing transitions) one outbox row have been written; on failure nothing has.
 */
export async function applyTransitionInTx(
  client: PoolClient, errandId: string, action: Action, actor: Actor, opts: TransitionOptions = {},
): Promise<TransitionResult> {
  const rule = TRANSITIONS[action];
  const now = opts.now ?? new Date();
  const { text, values } = buildTransitionUpdate(rule, errandId, actor, now);
  const { rows } = await client.query(text, values);
  if (rows.length === 0) return classifyFailure(client, rule, action, errandId, actor);

  const errand = mapErrandRow(rows[0]);
  await insertHistory(client, {
    errandId, from: sourceState(rule, errand), to: rule.to, action, actor, reason: opts.reason ?? null, at: now,
  });
  if (rule.closingMessage) {
    await insertOutboxEvent(client, {
      eventType: rule.closingMessage,
      topic: TOPICS.commands,
      key: errand.id,
      payload: closingMessagePayload(errand, rule.closingMessage, randomUUID()),
    });
  }
  return { ok: true, errand };
}

// States that require a courier (the errands CHECK constraints tie courier_id to these)
const COURIER_STATES: readonly ErrandState[] = ["ACCEPTED", "PICKED_UP", "DELIVERED"];

/**
 * Which of rule.from the UPDATE matched. PostgreSQL 17 can't return the old value, and reading
 * it separately would race, so a multi-source rule must have sources that differ in whether a
 * courier is assigned (today only cancel: OPEN has none, ACCEPTED has one and keeps it).
 */
function sourceState(rule: TransitionRule, updated: Errand): ErrandState {
  if (rule.from.length === 1) return rule.from[0];
  const candidates = rule.from.filter((s) => COURIER_STATES.includes(s) === (updated.courierId !== null));
  if (rule.courier !== undefined || candidates.length !== 1) {
    throw new Error(`cannot tell the source state of a ${rule.from.join("/")} -> ${rule.to} transition`);
  }
  return candidates[0];
}

/** applyTransitionInTx in its own transaction; a failed transition rolls back. */
export async function applyTransition(
  pool: Pool, errandId: string, action: Action, actor: Actor, opts: TransitionOptions = {},
): Promise<TransitionResult> {
  return inTransaction(pool, async (client) => {
    const result = await applyTransitionInTx(client, errandId, action, actor, opts);
    return result.ok ? result : rollback(result);
  });
}
