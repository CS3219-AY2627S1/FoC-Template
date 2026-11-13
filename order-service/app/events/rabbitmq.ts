/**
 * AI Assistance Disclosure:
 * Tool: Claude (Sonnet 5.5), date: 2026-10-19
 * Scope: RabbitMQ connection management and confirmed publishing
 * Author review: Reviewed and tested locally
 *
 * - Topic exchange (default name "orders", durable). Routing key is the event
 *   type lower-cased with dots, e.g. ORDER_COMPLETED -> "order.completed".
 * - Publisher confirms: publish() resolves only once the broker has accepted
 *   the message.
 * - `mandatory`: if NO queue is bound to the routing key the broker returns
 *   the message and publish() rejects, so the event stays in the outbox
 *   instead of being silently dropped. (Consumers must declare + bind their
 *   queue before events can be delivered; see README.)
 * - Reconnects lazily: if the connection drops, the next publish reconnects.
 */

import amqp from "amqplib";
import { env } from "../config/env.ts";
import type { OrderEvent } from "../models/types.ts";

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type ConfirmChannel = Awaited<ReturnType<Connection["createConfirmChannel"]>>;

const PUBLISH_TIMEOUT_MS = 10000;

const BEST_EFFORT_EVENTS = new Set<string>(["ORDER_CREATED", "ORDER_ACCEPTED", "ORDER_PICKED_UP"]);

let connection: Connection | null = null;
let channel: ConfirmChannel | null = null;
let connecting: Promise<ConfirmChannel> | null = null;
const returned = new Set<string>(); // messageIds the broker could not route

async function connect(): Promise<ConfirmChannel> {
  const brokerUrl = new URL(env.RABBITMQ_URL);
  if (env.RABBITMQ_USER || env.RABBITMQ_PASSWORD) {
    if (!env.RABBITMQ_USER || !env.RABBITMQ_PASSWORD) {
      throw new Error("Both RABBITMQ_USER and RABBITMQ_PASSWORD must be set");
    }
    brokerUrl.username = env.RABBITMQ_USER;
    brokerUrl.password = env.RABBITMQ_PASSWORD;
  }
  if (!brokerUrl.username || !brokerUrl.password) {
    throw new Error("RabbitMQ credentials must be set in the URL or environment");
  }

  const conn = await amqp.connect(brokerUrl.toString());
  conn.on("error", (err: Error) => console.error(`RabbitMQ connection error: ${err.message}`));
  conn.on("close", () => {
    connection = null;
    channel = null;
  });

  const ch = await conn.createConfirmChannel();
  ch.on("error", (err: Error) => console.error(`RabbitMQ channel error: ${err.message}`));
  ch.on("close", () => {
    channel = null;
  });
  ch.on("return", (msg: { properties: { messageId: string } }) => {
    returned.add(msg.properties.messageId);
  });

  await ch.assertExchange(env.RABBITMQ_EXCHANGE, "topic", { durable: true });

  connection = conn;
  channel = ch;
  return ch;
}

function getChannel(): Promise<ConfirmChannel> {
  if (channel) return Promise.resolve(channel);
  if (!connecting) {
    connecting = connect().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

export const routingKeyFor = (eventType: string): string =>
  eventType.toLowerCase().replace(/_/g, ".");

// Resolves once the broker confirms; rejects if it nacks, can't route, or times out.
export async function publishEvent(event: OrderEvent): Promise<void> {
  const ch = await getChannel();
  const routingKey = routingKeyFor(event.event_type);

  const confirmed = new Promise<void>((resolve, reject) => {
    ch.publish(
      env.RABBITMQ_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(event)),
      {
        persistent: true, // survive a broker restart
        mandatory: true,
        contentType: "application/json",
        messageId: event.event_id, // consumers de-duplicate on this
        type: event.event_type,
        timestamp: Math.floor(Date.now() / 1000),
      },
      (err: unknown) => (err ? reject(err) : resolve())
    );
  });

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Timed out waiting for broker confirmation")),
      PUBLISH_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([confirmed, timeout]);
  } finally {
    clearTimeout(timer);
  }

  // The 'return' event arrives before the confirm for unroutable messages
  if (returned.delete(event.event_id)) {
    if (BEST_EFFORT_EVENTS.has(event.event_type)) {
      console.warn(`No queue bound to "${routingKey}"; dropping informational event ${event.event_id}`);
      return;
    }
    throw new Error(
      `No queue is bound to "${routingKey}" on exchange "${env.RABBITMQ_EXCHANGE}" (is the credit service consuming yet?)`
    );
  }
}

export async function close(): Promise<void> {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch {
    // Closed, nothing to do on shutdown
  } finally {
    channel = null;
    connection = null;
  }
}
