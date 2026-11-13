import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";

// Every service publishes its events to this one topic exchange, with the event type as the
// routing key. Conventions and the event catalog: docs/events.md.
export const EVENTS_EXCHANGE = "relay.events";

export type Event = {
    eventId: string;
    type: string;
    occurredAt: string;
    data: Record<string, unknown>;
};

export class UnroutableEventError extends Error {
    constructor(type: string) {
        super(`no queue is bound for ${type} yet`);
    }
}

let connection: ChannelModel | undefined;
let channel: ConfirmChannel | undefined;
// Ids of mandatory messages the broker sent back because no queue was bound for them.
const returned = new Set<string>();

// Opens the connection on first use and again after it dropped. Only the announcement relay
// calls this, one publish at a time.
export async function connectBroker(): Promise<ConfirmChannel> {
    if (channel) return channel;

    const conn = await connect(config.BROKER_URL);
    // Without these listeners a dropped connection would be an unhandled error and end the process.
    conn.on("error", (err) => logger.warn({ err }, "broker connection failed"));
    conn.on("close", () => {
        connection = undefined;
        channel = undefined;
    });

    const ch = await conn.createConfirmChannel();
    ch.on("error", (err) => logger.warn({ err }, "broker channel failed"));
    ch.on("close", () => {
        channel = undefined;
    });
    // The broker sends an unroutable mandatory message back before it confirms it.
    ch.on("return", (message) => returned.add(String(message.properties.messageId)));
    await ch.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });

    connection = conn;
    channel = ch;
    logger.info("connected to the broker");
    return ch;
}

// Resolves once the broker has stored the event in at least one queue. Rejects when the broker
// cannot be reached or no queue is bound for the event yet, so the caller keeps the event and
// tries again later.
export async function publishEvent(event: Event): Promise<void> {
    const ch = await connectBroker();
    returned.delete(event.eventId);
    ch.publish(EVENTS_EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), {
        persistent: true,
        mandatory: true,
        contentType: "application/json",
        messageId: event.eventId,
        type: event.type,
        appId: "user-service",
        timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
    });
    await ch.waitForConfirms();
    if (returned.delete(event.eventId)) throw new UnroutableEventError(event.type);
}

export function isBrokerConnected(): boolean {
    return channel !== undefined;
}

export async function closeBroker(): Promise<void> {
    await connection?.close().catch(() => undefined);
}
