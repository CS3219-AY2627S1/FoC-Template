/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Deadline sweeper, the "system" actor that fires reservation timeout, listing expiry
 *        and the pickup, delivery and confirmation timeouts, implementing the approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { SWEEPER } from "../config";
import { inTransaction } from "../db";
import { TRANSITIONS, type Action } from "../domain/transitions";
import { applyTransitionInTx } from "../errands/repository";
import { errorMessage, log } from "../log";

export type SweepCounts = Record<
  "reservationTimeout" | "expire" | "pickupTimeout" | "deliveryTimeout" | "confirmTimeout",
  number
>;

// Every system rule with a deadline comes from the transition table; ORDER only fixes the sequence:
// reservation timeouts first (the credit reply is the one thing racing them), and pickupTimeout
// before expire so an errand returned to OPEN can expire in the same tick.
const ORDER: (keyof SweepCounts)[] = ["reservationTimeout", "pickupTimeout", "expire", "deliveryTimeout", "confirmTimeout"];
const SYSTEM_ACTIONS = ORDER.filter((a) => TRANSITIONS[a].party === "system" && TRANSITIONS[a].deadline?.mustHavePassed);
assert.equal(
  SYSTEM_ACTIONS.length,
  (Object.keys(TRANSITIONS) as Action[]).filter((a) => TRANSITIONS[a].party === "system" && TRANSITIONS[a].deadline?.mustHavePassed).length,
  "sweeper ORDER is missing a system action",
);

type Transition = typeof applyTransitionInTx;

/**
 * One transaction: lock up to batchSize due errands (skipping rows another sweeper or request
 * holds, and ids that already failed in this sweep) and transition each inside its own
 * savepoint, so a row that throws is rolled back, logged and skipped without losing the rest.
 */
async function sweepBatch(
  pool: Pool, action: keyof SweepCounts, now: Date, failed: Set<string>, transition: Transition,
): Promise<{ selected: number; done: number; progressed: number }> {
  const rule = TRANSITIONS[action];
  const column = rule.deadline!.column; // a fixed DeadlineColumn name, never user input
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM errands WHERE state = ANY($1::errand_state[]) AND ${column} <= $2 AND id <> ALL($4::uuid[])
       ORDER BY ${column} LIMIT $3 FOR UPDATE SKIP LOCKED`,
      [rule.from, now, SWEEPER.batchSize, [...failed]],
    );
    let done = 0;
    let progressed = 0;
    for (const { id } of rows) {
      await client.query("SAVEPOINT sweep_row");
      try {
        const result = await transition(client, id, action, { kind: "system" }, { now });
        await client.query("RELEASE SAVEPOINT sweep_row");
        if (result.ok) {
          done++;
          progressed++;
        }
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT sweep_row");
        failed.add(id);
        progressed++;
        log.error("deadline_sweep_row_failed", { action, errandId: id, error: errorMessage(err) });
      }
    }
    return { selected: rows.length, done, progressed };
  });
}

/** Sweeps one action until nothing due is left; returns how many transitions succeeded. */
export async function sweepAction(
  pool: Pool, action: keyof SweepCounts, now: Date = new Date(), failed: Set<string> = new Set(), transition: Transition = applyTransitionInTx,
): Promise<number> {
  let total = 0;
  for (;;) {
    const { selected, done, progressed } = await sweepBatch(pool, action, now, failed, transition);
    total += done;
    // A short batch means nothing due is left; a batch with no progress would repeat forever
    if (selected < SWEEPER.batchSize || progressed === 0) return total;
  }
}

/**
 * Fires every due system transition once; returns how many succeeded per action. A failing
 * row or action is logged and skipped, so it cannot stop the others. `transition` is a test seam.
 */
export async function sweepDeadlines(pool: Pool, now: Date = new Date(), transition: Transition = applyTransitionInTx): Promise<SweepCounts> {
  const counts: SweepCounts = { reservationTimeout: 0, expire: 0, pickupTimeout: 0, deliveryTimeout: 0, confirmTimeout: 0 };
  const failed = new Set<string>();
  for (const action of SYSTEM_ACTIONS) {
    try {
      counts[action] = await sweepAction(pool, action, now, failed, transition);
    } catch (err) {
      log.error("deadline_sweep_action_failed", { action, error: errorMessage(err) });
    }
  }
  return counts;
}

/** Runs sweepDeadlines every SWEEPER.intervalMs, never overlapping; stop() waits for a running sweep. */
export function startDeadlineSweeper(pool: Pool): { stop(): Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = (): void => {
    running = (async () => {
      try {
        const counts = await sweepDeadlines(pool);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        if (total > 0) log.info("deadline_sweep", counts);
      } catch (err) {
        log.error("deadline_sweep_failed", { error: errorMessage(err) });
      }
      // Scheduled only after the sweep ends, so sweeps cannot overlap
      if (!stopped) timer = setTimeout(tick, SWEEPER.intervalMs);
    })();
  };
  timer = setTimeout(tick, SWEEPER.intervalMs);

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
