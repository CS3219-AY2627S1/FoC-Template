/**
 * AI Assistance Disclosure:
 * Tool: Claude (Opus 5.5), date: 2026-11-10
 * Scope: RabbitMQ consumer for order events, with reconnects, de-duplication and retry
 * Author review: Reviewed and tested locally
 *
 * - Also bound to "user.registered" on the "users" exchange: a new user's email
 *   is subscribed to SNS automatically (see notifications/subscriber.ts).
 * - Owns a DURABLE queue bound to "order.#" on the shared topic exchange, so it
 *   receives every order event without competing with the credit service
 *   (each service has its own queue; the exchange fans out a copy to each).
 *   Because the queue is durable, events published while this service is down
 *   wait in the queue and are emailed when it comes back.
 * - At-least-once delivery: duplicates are skipped by event_id (in-memory,
 *   bounded; acceptable for notifications).
 * - Ack only after SNS accepts the message. On failure the message is
 *   requeued once; if the retry also fails it is dropped and logged, so a
 *   persistent SNS outage cannot loop forever.
 */

import amqp from "amqplib";
import { env } from "../config.ts";
import { parseOrderEvent } from "./orderEvent.ts";
import { parseUserRegisteredEvent } from "./userEvent.ts";
import { subscribeUser } from "../notifications/subscriber.ts";
import { buildNotifications } from "../notifications/templates.ts";
import { send } from "../notifications/sender.ts";

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Channel = Awaited<ReturnType<Connection["createChannel"]>>;

const RECONNECT_MS = 5000;
const SEEN_LIMIT = 10_000;

let connection: Connection | null = null;
let channel: Channel | null = null;
let stopping = false;
const seen = new Set<string>(); // insertion-ordered: oldest evicted first

function markSeen(id: string): void {
  seen.add(id);
  if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
}

function brokerUrl(): string {
  const url = new URL(env.RABBITMQ_URL);
  if (env.RABBITMQ_USER && env.RABBITMQ_PASSWORD) {
    url.username = env.RABBITMQ_USER;
    url.password = env.RABBITMQ_PASSWORD;
  }
  return url.toString();
}

export const isConnected = (): boolean => channel !== null;

function scheduleReconnect(): void {
  if (stopping) return;
  setTimeout(() => void start(), RECONNECT_MS);
}

export async function start(): Promise<void> {
  try {
    const conn = await amqp.connect(brokerUrl());
    conn.on("error", (err: Error) => console.error(`[Notification] RabbitMQ connection error: ${err.message}`));
    conn.on("close", () => {
      connection = null;
      channel = null;
      if (!stopping)
        console.error(`[Notification] RabbitMQ connection closed, reconnecting in ${RECONNECT_MS / 1000}s`);
      scheduleReconnect();
    });

    const ch = await conn.createChannel();
    ch.on("error", (err: Error) => console.error(`[Notification] RabbitMQ channel error: ${err.message}`));

    await ch.assertExchange(env.RABBITMQ_EXCHANGE, "topic", { durable: true });
    await ch.assertQueue(env.QUEUE_NAME, { durable: true });
    await ch.bindQueue(env.QUEUE_NAME, env.RABBITMQ_EXCHANGE, "order.#");
    await ch.assertExchange(env.USER_EVENTS_EXCHANGE, "topic", { durable: true });
    await ch.bindQueue(env.QUEUE_NAME, env.USER_EVENTS_EXCHANGE, "user.registered");
    await ch.prefetch(10);

    connection = conn;
    channel = ch;
    console.log(
      `[Notification] Consuming "order.#" from "${env.RABBITMQ_EXCHANGE}" and "user.registered" from "${env.USER_EVENTS_EXCHANGE}" via queue "${env.QUEUE_NAME}"`,
    );

    await ch.consume(
      env.QUEUE_NAME,
      async (msg) => {
        if (!msg) return;
        let eventId = msg.properties.messageId as string | undefined;
        try {
          const raw = JSON.parse(msg.content.toString());

          if (msg.fields.routingKey === "user.registered") {
            const userEvent = parseUserRegisteredEvent(raw);
            eventId = userEvent.event_id;
            if (!seen.has(eventId)) {
              await subscribeUser(userEvent.data.user_id, userEvent.data.email);
              markSeen(eventId);
            }
            ch.ack(msg);
            return;
          }

          const event = parseOrderEvent(raw);
          eventId = event.event_id;

          if (seen.has(eventId)) {
            console.log(`[Notification] Duplicate ${event.event_type} ${eventId}, skipped`);
            ch.ack(msg);
            return;
          }

          const notifications = buildNotifications(event, env.APP_URL);
          await Promise.all(notifications.map(send));
          markSeen(eventId);
          ch.ack(msg);
          console.log(
            `[Notification] ${event.event_type} for order ${event.data.order_id}: sent ${notifications.length} email(s)`,
          );
        } catch (err) {
          const retry = !msg.fields.redelivered && !(err instanceof SyntaxError);
          console.error(
            `[Notification] Failed on ${msg.fields.routingKey} (${eventId ?? "no id"}): ${(err as Error).message}` +
              (retry ? " - requeueing once" : " - dropping"),
          );
          ch.nack(msg, false, retry);
        }
      },
      { noAck: false },
    );
  } catch (err) {
    console.error(
      `[Notification] Could not connect to RabbitMQ (${(err as Error).message}), retrying in ${RECONNECT_MS / 1000}s`,
    );
    scheduleReconnect();
  }
}

export async function stop(): Promise<void> {
  stopping = true;
  try {
    await channel?.close();
    await connection?.close();
  } catch {
    // already closed
  }
}
