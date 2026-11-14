// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-10-21
// Scope: Generated the credit-allocation outbox relay (Stage 14c). No requirements,
//        architecture, schema, or API decisions were made by the AI tool — see
//        instructions.md Stage 14 for the governing decision.
// Author review:

import { config } from "../config.js";
import {
  findDueCreditAllocations,
  markCreditAllocationDead,
  markCreditAllocationSent,
  recordCreditAllocationFailure,
} from "../db/queries/creditOutbox.queries.js";

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 10;
const BASE_DELAY_SECONDS = 1;
const MAX_DELAY_SECONDS = 300;

type DeliveryOutcome = "sent" | "dead" | "retry";

export function classifyResponseStatus(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return "sent";
  if (status === 409) return "sent";
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 500
  ) {
    return "dead";
  }
  if (status === 408 || status === 425 || status === 429) return "retry";
  if (status >= 500 && status < 600) return "retry";
  return "dead";
}

async function deliverCreditAllocation(
  userId: string,
): Promise<{ action: DeliveryOutcome; error?: string }> {
  let response: Response;
  try {
    response = await fetch(`${config.creditService.url}/credits/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { action: "retry", error: "TIMEOUT" };
    }
    const code =
      err instanceof Error && "cause" in err
        ? ((err.cause as { code?: string } | undefined)?.code ?? "UNKNOWN")
        : "UNKNOWN";
    return { action: "retry", error: `NETWORK ${code}` };
  }

  const action = classifyResponseStatus(response.status);
  if (action === "sent") return { action };

  let code: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string") {
      code = (body as { code: string }).code;
    }
  } catch {
    // Not JSON; ignore the body.
  }

  return {
    action,
    error: code ? `HTTP ${response.status} ${code}` : `HTTP ${response.status}`,
  };
}

async function runOutboxPass(): Promise<void> {
  for (;;) {
    const rows = await findDueCreditAllocations(BATCH_SIZE);
    if (rows.length === 0) return;

    const results = await Promise.allSettled(
      rows.map((row) => deliverCreditAllocation(row.user_id)),
    );

    await Promise.all(
      rows.map(async (row, index) => {
        const settled = results[index]!;
        if (settled.status !== "fulfilled") return;
        const { action, error } = settled.value;

        if (action === "sent") {
          await markCreditAllocationSent(row.id);
        } else if (action === "dead") {
          await markCreditAllocationDead(row.id, error!);
        } else {
          await recordCreditAllocationFailure(row.id, error!, {
            maxAttempts: MAX_ATTEMPTS,
            baseDelaySeconds: BASE_DELAY_SECONDS,
            maxDelaySeconds: MAX_DELAY_SECONDS,
          });
        }
      }),
    );
  }
}

export function startCreditOutboxRelay(): { stop(): Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlightPass: Promise<void> = Promise.resolve();

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  function tick(): void {
    inFlightPass = runOutboxPass().catch((err: unknown) => {
      console.error(
        `Credit outbox relay pass failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    void inFlightPass.then(schedule);
  }

  tick();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlightPass;
    },
  };
}
