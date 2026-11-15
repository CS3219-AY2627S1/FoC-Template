/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Stub Credit Service behind MessagePublisher. It holds credits in memory like the real
 *        service, replies to ReserveRequested, and checks every message against
 *        docs/order-credit-contract.md, implementing the approved plan.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Added restore(), which rebuilds the holds from already-published outbox rows so a
 *        service restart does not cause false contract violations.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: restore() replays rows in outbox id order, the order they were published.
 * Author review of additional changes: Reviewed and approved by @phuc
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { handleCreditResult } from "../credit/creditResults";
import { errorMessage, log } from "../log";
import type { MessagePublisher, OutboxMessage } from "../outbox";

export interface StubHold {
  requesterId: string;
  amount: number;
  status: "HELD" | "CAPTURED" | "RELEASED";
  operationIds: string[];
  /** True once the CreditReserved reply has been sent; terminal events before it break rule 3. */
  replied: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL = ["OrderCompleted", "OrderCancelled", "OrderExpired", "OrderFailed"];

export class StubCreditBus implements MessagePublisher {
  private readonly holds = new Map<string, StubHold>();
  // Orders whose ReserveRequested was rejected (no hold), with that request's operation_id
  private readonly rejected = new Map<string, string>();
  private readonly found: string[] = [];
  private replaying = false;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly pool: Pool,
    private readonly opts: { limit: number; delayMs: number; silentAmount: number },
  ) {}

  /** Processes the messages in order; their effects on the holds are in place when this resolves. */
  async publish(messages: OutboxMessage[]): Promise<void> {
    for (const m of messages) {
      log.info("credit.stub.sent", { eventId: m.eventId, topic: m.topic, key: m.key, type: m.payload.type });
      this.process(m.payload);
    }
  }

  /**
   * Rebuilds the holds from outbox rows already published before a restart, without sending
   * replies. A hold whose errand has left PENDING_RESERVATION counts as replied.
   */
  async restore(): Promise<void> {
    const { rows } = await this.pool.query(
      `SELECT payload FROM outbox WHERE published_at IS NOT NULL ORDER BY id`,
    );
    this.replaying = true;
    try {
      for (const r of rows) this.process(r.payload, true);
    } finally {
      this.replaying = false;
    }
    const ids = [...this.holds.keys()];
    if (ids.length === 0) return;
    const states = await this.pool.query(`SELECT id, state FROM errands WHERE id = ANY($1::uuid[])`, [ids]);
    for (const e of states.rows) {
      const hold = this.holds.get(e.id);
      if (hold && e.state !== "PENDING_RESERVATION") hold.replied = true;
    }
    log.info("credit.stub.restored", { holds: ids.length });
  }

  /** The hold for an errand, if the stub made one (for tests). */
  hold(orderId: string): StubHold | undefined {
    return this.holds.get(orderId);
  }

  /** Every contract violation seen so far (for tests). */
  violations(): string[] {
    return [...this.found];
  }

  /** Resolves when no replies are pending (for tests). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  private violation(p: Record<string, unknown>, reason: string): void {
    // Replayed rows were already checked when first sent; replay only rebuilds the holds
    if (this.replaying) return;
    this.found.push(reason);
    log.warn("credit.stub.contract_violation", { type: p.type, orderId: p.order_id, operationId: p.operation_id, reason });
  }

  // Missing or malformed required fields, or null if the payload is well-formed
  private shapeProblem(p: Record<string, unknown>): string | null {
    if (p.schema_version !== 1) return "schema_version is not 1";
    for (const f of ["operation_id", "order_id", "requester_id"]) {
      if (typeof p[f] !== "string" || !UUID_RE.test(p[f] as string)) return `${f} is missing or not a UUID`;
    }
    if (!Number.isSafeInteger(p.amount) || (p.amount as number) < 1) return "amount is missing or not a whole number";
    if (typeof p.occurred_at !== "string" || Number.isNaN(Date.parse(p.occurred_at))) return "occurred_at is missing or not a timestamp";
    return null;
  }

  private courierProblem(p: Record<string, unknown>): string | null {
    if (p.type === "OrderCompleted") {
      if (typeof p.courier_id !== "string" || !UUID_RE.test(p.courier_id)) return "OrderCompleted needs a UUID courier_id";
      if (p.courier_id.toLowerCase() === (p.requester_id as string).toLowerCase()) return "OrderCompleted courier_id equals requester_id";
    } else if (TERMINAL.includes(p.type as string)) {
      if (p.courier_id !== null) return `${p.type} needs courier_id null`;
    } else if ("courier_id" in p) {
      return `${p.type} must not have a courier_id`;
    }
    return null;
  }

  private process(p: Record<string, unknown>, replay = false): void {
    const type = p.type;
    if (type !== "ReserveRequested" && type !== "ReservationTimedOut" && !TERMINAL.includes(type as string)) {
      return this.violation(p, `unknown type ${String(type)}`);
    }
    const problem = this.shapeProblem(p) ?? this.courierProblem(p);
    if (problem) return this.violation(p, problem);

    const orderId = p.order_id as string;
    const operationId = p.operation_id as string;
    const hold = this.holds.get(orderId);

    if (hold?.operationIds.includes(operationId) || this.rejected.get(orderId) === operationId) {
      log.info("credit.stub.duplicate", { type, orderId, operationId });
      return;
    }

    if (type === "ReserveRequested") {
      if (hold || this.rejected.has(orderId)) {
        return this.violation(p, "second ReserveRequested for the order with a different operation_id (rule 1)");
      }
      const amount = p.amount as number;
      // Like real Credit, the outcome is decided now: an accepted request holds before it replies
      if (amount > this.opts.limit && amount !== this.opts.silentAmount) {
        this.rejected.set(orderId, operationId);
        log.info("credit.stub.applied", { type, orderId, operationId, status: "REJECTED" });
        if (!replay) this.scheduleReply(orderId, operationId, null);
        return;
      }
      const created: StubHold = {
        requesterId: p.requester_id as string, amount, status: "HELD", operationIds: [operationId], replied: false,
      };
      this.holds.set(orderId, created);
      log.info("credit.stub.applied", { type, orderId, operationId, status: "HELD" });
      // A lost reply is mimicked by the silent amount: the hold exists but nothing answers
      if (amount !== this.opts.silentAmount && !replay) this.scheduleReply(orderId, operationId, created);
      return;
    }

    if (!hold) {
      if (type === "ReservationTimedOut") {
        log.info("credit.stub.applied", { type, orderId, operationId, status: "NO_HOLD" });
        return;
      }
      return this.violation(p, "terminal event with no hold (rule 3)");
    }
    if (hold.status !== "HELD") {
      return this.violation(p, `hold already ${hold.status} by a different operation_id (rule 2)`);
    }
    if (type !== "ReservationTimedOut" && !hold.replied) {
      return this.violation(p, "terminal event before CreditReserved was delivered (rule 3)");
    }
    if (p.requester_id !== hold.requesterId) return this.violation(p, "requester_id differs from the hold (rule 4)");
    if (p.amount !== hold.amount) return this.violation(p, `amount ${String(p.amount)} differs from the held amount ${hold.amount} (rule 4)`);

    hold.status = type === "OrderCompleted" ? "CAPTURED" : "RELEASED";
    hold.operationIds.push(operationId);
    log.info("credit.stub.applied", { type, orderId, operationId, status: hold.status });
  }

  /** `hold` is the new hold for CreditReserved, or null for a rejection. */
  private scheduleReply(orderId: string, operationId: string, hold: StubHold | null): void {
    const task = (async () => {
      await new Promise((resolve) => setTimeout(resolve, this.opts.delayMs));
      const eventId = randomUUID();
      try {
        // Marked first: the reply is on its way, and Order can't act on it before it commits
        if (hold) hold.replied = true;
        await handleCreditResult(
          this.pool,
          hold
            ? { type: "CreditReserved", eventId, operationId, orderId, reservationId: randomUUID() }
            : { type: "CreditReservationRejected", eventId, operationId, orderId, reasonCode: "INSUFFICIENT_CREDIT" },
        );
      } catch (err) {
        log.error("credit.stub.reply_failed", { orderId, error: errorMessage(err) });
      }
    })();
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }
}
