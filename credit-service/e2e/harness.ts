/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: End-to-end test harness: sends messages to the Credit Service topics as User Service
 *        and Order Service would, collects replies and DLQ messages, and reads the database.
 * Author review: Reviewed and approved by @phuc
 */
import { randomUUID } from "node:crypto";
import { KafkaJS } from "@confluentinc/kafka-javascript";
import { Pool } from "pg";

export const TOPICS = {
  accountStatus: "user.account-status",
  commands: "credit.commands",
  results: "credit.results",
  accountStatusDlq: "user.account-status.dlq",
  commandsDlq: "credit.commands.dlq",
} as const;

export interface Received {
  topic: string;
  key: string | null;
  body: Record<string, any>;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export class Harness {
  readonly received: Received[] = [];
  readonly pool = new Pool({ connectionString: env("E2E_DATABASE_URL") });
  private readonly kafka = new KafkaJS.Kafka({
    kafkaJS: { brokers: env("KAFKA_BROKERS").split(","), clientId: "credit-e2e", logLevel: KafkaJS.logLevel.ERROR },
  });
  private readonly producer = this.kafka.producer({ kafkaJS: { idempotent: true, acks: -1 } });
  private readonly consumer = this.kafka.consumer({
    kafkaJS: { groupId: `credit-e2e-${randomUUID()}`, fromBeginning: true, autoCommit: true },
  });

  async start(): Promise<void> {
    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [TOPICS.results, TOPICS.accountStatusDlq, TOPICS.commandsDlq] });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        this.received.push({
          topic,
          key: message.key ? message.key.toString("utf8") : null,
          body: JSON.parse(message.value!.toString("utf8")),
        });
      },
    });
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
    await this.producer.disconnect();
    await this.pool.end();
  }

  /** Sends a raw value (string) or a JSON body to a topic. */
  async send(topic: string, key: string, value: string | Record<string, unknown>): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ key, value: typeof value === "string" ? value : JSON.stringify(value) }],
    });
  }

  // ---- Messages as User Service and Order Service send them (proposal §5.2, §6.2) ----

  async accountStatus(accountId: string, newStatus: string, firstActive = false, operationId: string = randomUUID()) {
    const body = {
      operation_id: operationId,
      account_id: accountId,
      new_status: newStatus,
      first_active: firstActive,
      occurred_at: new Date().toISOString(),
      schema_version: 1,
    };
    await this.send(TOPICS.accountStatus, accountId, body);
    return body;
  }

  async reserve(requesterId: string, amount: number, orderId: string = randomUUID(), operationId: string = randomUUID()) {
    const body = {
      type: "ReserveRequested",
      operation_id: operationId,
      order_id: orderId,
      requester_id: requesterId,
      amount,
      occurred_at: new Date().toISOString(),
      schema_version: 1,
    };
    await this.send(TOPICS.commands, orderId, body);
    return body;
  }

  async terminal(type: string, reserve: { order_id: string; requester_id: string; amount: number }, courierId?: string) {
    const body: Record<string, unknown> = {
      type,
      operation_id: randomUUID(),
      order_id: reserve.order_id,
      requester_id: reserve.requester_id,
      amount: reserve.amount,
      occurred_at: new Date().toISOString(),
      schema_version: 1,
    };
    if (courierId) body.courier_id = courierId;
    await this.send(TOPICS.commands, reserve.order_id, body);
    return body;
  }

  // ---- Waiting for results ----

  /** The first message on `topic` matching `match`, waiting up to `timeoutMs`. */
  async waitForMessage(topic: string, match: (m: Received) => boolean, timeoutMs = 20_000): Promise<Received> {
    return waitFor(`a message on ${topic}`, () => this.received.find((m) => m.topic === topic && match(m)), timeoutMs);
  }

  /** The reply on credit.results to the request with this operation_id. */
  reply(operationId: string): Promise<Received> {
    return this.waitForMessage(TOPICS.results, (m) => m.body.operation_id === operationId);
  }

  repliesTo(operationId: string): Received[] {
    return this.received.filter((m) => m.topic === TOPICS.results && m.body.operation_id === operationId);
  }

  /** Creates an account with the initial grant and waits until Credit Service has it. */
  async grantedAccount(): Promise<string> {
    const id = randomUUID();
    await this.accountStatus(id, "ACTIVE", true);
    await waitFor(`account ${id}`, async () => (await this.balance(id)) ?? undefined);
    return id;
  }

  // ---- Database reads ----

  async balance(userId: string): Promise<{ available: number; reserved: number; status: string } | null> {
    const { rows } = await this.pool.query(
      "SELECT available_balance, reserved_balance, status FROM credit_accounts WHERE user_id = $1",
      [userId],
    );
    if (rows.length === 0) return null;
    return { available: Number(rows[0].available_balance), reserved: Number(rows[0].reserved_balance), status: rows[0].status };
  }

  /** Waits until the balance equals `expected` (fields given), returning the last read. */
  async waitForBalance(userId: string, expected: Partial<{ available: number; reserved: number; status: string }>) {
    let last: Awaited<ReturnType<Harness["balance"]>> = null;
    try {
      return await waitFor(`balance of ${userId} to be ${JSON.stringify(expected)}`, async () => {
        last = await this.balance(userId);
        if (!last) return undefined;
        const matches = Object.entries(expected).every(([k, v]) => (last as Record<string, unknown>)[k] === v);
        return matches ? last : undefined;
      });
    } catch (err) {
      throw new Error(`${(err as Error).message}; last read: ${JSON.stringify(last)}`);
    }
  }

  async transactionTypes(userId: string): Promise<string[]> {
    const { rows } = await this.pool.query("SELECT type FROM credit_transactions WHERE user_id = $1 ORDER BY id", [userId]);
    return rows.map((r) => r.type);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns a value other than undefined, or fails after `timeoutMs`. */
export async function waitFor<T>(what: string, check: () => T | undefined | Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(100);
  }
}
