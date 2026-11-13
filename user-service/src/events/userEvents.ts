/**
 * AI Assistance Disclosure:
 * Tool: Claude (Opus 5.5), date: 2026-11-10
 * Scope: Best-effort publishing of USER_REGISTERED events to RabbitMQ
 * Author review: Reviewed and tested locally
 *
 * - Topic exchange "users" (durable), routing key "user.registered".
 *   The notification service binds to it and subscribes the new user's
 *   email to SNS, so nobody has to add subscribers by hand.
 * - Best-effort: called after the registration transaction commits.
 *   A broker failure is logged and NEVER fails the sign-up.
 *   (Trade-off: no outbox here, so an event can be lost if the broker is
 *   down at that moment; the user can be subscribed manually.)
 * - Disabled when RABBITMQ_URL is not set (unit tests, standalone runs).
 */

import { randomUUID } from "node:crypto";
import amqp from "amqplib";

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type ConfirmChannel = Awaited<ReturnType<Connection["createConfirmChannel"]>>;

const EXCHANGE = process.env.USER_EVENTS_EXCHANGE || "users";
const PUBLISH_TIMEOUT_MS = 5000;

let connection: Connection | null = null;
let channel: ConfirmChannel | null = null;
let connecting: Promise<ConfirmChannel> | null = null;

function brokerUrl(): string | null {
  const raw = process.env.RABBITMQ_URL;
  if (!raw) return null;
  const url = new URL(raw);
  if (process.env.RABBITMQ_USER && process.env.RABBITMQ_PASSWORD) {
    url.username = process.env.RABBITMQ_USER;
    url.password = process.env.RABBITMQ_PASSWORD;
  }
  return url.toString();
}

async function connect(url: string): Promise<ConfirmChannel> {
  const conn = await amqp.connect(url);
  conn.on("error", (err: Error) => console.error(`[UserEvents] RabbitMQ connection error: ${err.message}`));
  conn.on("close", () => {
    connection = null;
    channel = null;
  });
  const ch = await conn.createConfirmChannel();
  ch.on("error", (err: Error) => console.error(`[UserEvents] RabbitMQ channel error: ${err.message}`));
  ch.on("close", () => {
    channel = null;
  });
  await ch.assertExchange(EXCHANGE, "topic", { durable: true });
  connection = conn;
  channel = ch;
  return ch;
}

function getChannel(url: string): Promise<ConfirmChannel> {
  if (channel) return Promise.resolve(channel);
  connecting ??= connect(url).finally(() => {
    connecting = null;
  });
  return connecting;
}

export interface UserRegisteredData {
  user_id: string;
  email: string;
}

async function publish(data: UserRegisteredData): Promise<void> {
  const url = brokerUrl();
  if (!url) return;

  const ch = await getChannel(url);
  const event = {
    event_id: randomUUID(),
    event_type: "USER_REGISTERED",
    timestamp: new Date().toISOString(),
    data,
  };

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) =>
        ch.publish(
          EXCHANGE,
          "user.registered",
          Buffer.from(JSON.stringify(event)),
          {
            persistent: true,
            contentType: "application/json",
            messageId: event.event_id,
            type: event.event_type,
          },
          (err: unknown) => (err ? reject(err) : resolve()),
        ),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Timed out waiting for broker confirmation")), PUBLISH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget. Never throws. */
export function publishUserRegistered(data: UserRegisteredData): void {
  publish(data).catch((err: Error) =>
    console.error(`[UserEvents] Could not publish USER_REGISTERED for ${data.user_id}: ${err.message}`),
  );
}

export async function closeUserEvents(): Promise<void> {
  try {
    await channel?.close();
    await connection?.close();
  } catch {
    // already closed
  }
}
