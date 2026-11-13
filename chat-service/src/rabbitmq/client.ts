// src/rabbitmq/client.ts
// Connection, topology and the consumer for the order and credit events that open and close
// chats. The chat service only LISTENS: it publishes no events of its own, so it needs no outbox.
import amqplib from "amqplib";
import config from "../config.ts";
import log from "../log.ts";
import {
    clearCourier,
    deleteSession,
    findSession,
    markEnded,
    upsertCourier,
    upsertRequester,
} from "../prisma/chats.ts";
import { notifyChat, notifyDeleted } from "../realtime/events.ts";

const EXCHANGE = "app.events"; // durable topic exchange, declared by every service
const DLX_NAME = "app.dlx"; // dead-letter exchange, same one the other services declare (topic)
const QUEUE_NAME = "chat.events.queue";
const DLQ_NAME = "chat.events.dlq";

// the wire contract with the order and credit services (see order-service/src/rabbitmq/events.ts)
export const ROUTING = {
    orderCreated: "order.created", // { errandId, requestorId, ... }: who the requester is
    orderAccepted: "order.accepted", // { errandId, courierId }: a courier accepted, the chat opens
    orderCompleted: "order.completed", // { errandId, ... }: delivered, the chat is deleted later
    orderCancelled: "order.cancelled", // { errandId }: cancelled or expired
    // sent by Credit when it refuses the courier; the order goes back to OPEN
    creditsAcceptedRejected: "credits.accepted.rejected", // { errandId, reason }
} as const;

const BINDING_KEYS = Object.values(ROUTING);

// the reasons for which Order undoes the accept (order-service/src/rabbitmq/client.ts)
const ACCEPT_UNDONE_REASONS = ["COURIER_NOT_FOUND", "COURIER_ALREADY_ASSIGNED"];

let connected = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const isConnected = () => connected;

const positiveInt = (value: unknown, field: string): number => {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
        throw new Error(`event has an invalid ${field}`);
    return value;
};

/**
 * What each event does. Every branch is safe to run twice (RabbitMQ can deliver a message more
 * than once) and in any order between the order.* events, because each one only fills in or
 * changes its own part of the chat.
 */
export const handleEvent = async (routingKey: string, payload: Record<string, unknown>): Promise<void> => {
    const errandId = payload.errandId;
    if (typeof errandId !== "string" || errandId.length === 0)
        throw new Error(`${routingKey} has no errandId`);
    log.info(`Received ${routingKey} for errand ${errandId}`);

    switch (routingKey) {
        case ROUTING.orderCreated: {
            // "requestor" (with an o) is how the contract spells it
            const session = await upsertRequester(errandId, positiveInt(payload.requestorId, "requestorId"));
            // if order.accepted was handled first, the courier is already known and this is what
            // completes the chat
            if (session.courierId !== null) {
                log.info(`Chat for errand ${errandId} is open`);
                await notifyChat("chat.opened", session);
            }
            break;
        }
        case ROUTING.orderAccepted: {
            const session = await upsertCourier(errandId, positiveInt(payload.courierId, "courierId"));
            if (session.requesterId !== null) {
                log.info(`Chat for errand ${errandId} is open`);
                await notifyChat("chat.opened", session);
            } else {
                log.warn(`order.accepted for ${errandId} but its requester is not known yet (order.created not seen); the chat opens once it is`);
            }
            break;
        }
        case ROUTING.orderCompleted:
        case ROUTING.orderCancelled: {
            const delivered = routingKey === ROUTING.orderCompleted;
            const existing = await findSession(errandId);
            if (!existing) {
                log.info(`${routingKey} ignored for ${errandId} (no chat)`);
                break;
            }
            if (existing.courierId === null) {
                // never accepted, so there was no chat to keep: just forget it
                await deleteSession(errandId);
                log.info(`Removed the unused chat record for errand ${errandId}`);
                break;
            }
            const ended = await markEnded(errandId, delivered ? "DELIVERED" : "CANCELLED", config.chat.retentionMinutes);
            if (ended) {
                log.info(`Chat for errand ${errandId} ends: ${ended.endReason}, deleted at ${ended.deleteAt}`);
                await notifyChat("chat.updated", ended);
            }
            break;
        }
        case ROUTING.creditsAcceptedRejected: {
            const reason = String(payload.reason);
            if (!ACCEPT_UNDONE_REASONS.includes(reason)) {
                log.info(`credits.accepted.rejected (${reason}) ignored for ${errandId}: the accept is not undone`);
                break;
            }
            // the courier was refused, so there is no courier: take the chat away from both people
            const who = await clearCourier(errandId);
            if (who) {
                log.warn(`Accept undone for errand ${errandId} (${reason}); its chat was cleared`);
                notifyDeleted(errandId, who);
            }
            break;
        }
        default:
            log.warn(`Unhandled routing key: ${routingKey}`);
    }
};

const setup = async () => {
    const connection = await amqplib.connect(config.rabbitMqUrl!);
    connection.on("error", (e: unknown) => log.error(`RabbitMQ connection error: ${e}`));

    try {
        const ch = await connection.createChannel();
        ch.on("close", () => { connected = false; });
        ch.on("error", (e: unknown) => log.error(`RabbitMQ channel error: ${e}`));

        // same names and types as the other services, otherwise the declare fails
        await ch.assertExchange(EXCHANGE, "topic", { durable: true });
        await ch.assertExchange(DLX_NAME, "topic", { durable: true });

        // messages that keep failing land here instead of being lost
        await ch.assertQueue(DLQ_NAME, { durable: true });
        await ch.bindQueue(DLQ_NAME, DLX_NAME, QUEUE_NAME);

        await ch.assertQueue(QUEUE_NAME, {
            durable: true,
            deadLetterExchange: DLX_NAME,
            deadLetterRoutingKey: QUEUE_NAME,
        });
        for (const key of BINDING_KEYS) await ch.bindQueue(QUEUE_NAME, EXCHANGE, key);

        await ch.prefetch(10);
        await ch.consume(QUEUE_NAME, async (msg) => {
            if (!msg) return;
            try {
                await handleEvent(msg.fields.routingKey, JSON.parse(msg.content.toString()));
                ch.ack(msg);
            } catch (error) {
                // first failure: requeue once; second failure: dead-letter
                log.error(`Failed to process ${msg.fields.routingKey}: ${error}`);
                ch.nack(msg, false, !msg.fields.redelivered);
            }
        });

        connection.on("close", () => {
            connected = false;
            log.warn("RabbitMQ connection closed, reconnecting");
            void connectRabbitMQ();
        });
        connected = true;
    } catch (error) {
        await connection.close().catch(() => {});
        throw error;
    }
};

/**
 * Connects with retry/backoff and keeps the consumer running.
 * Call it WITHOUT await so the HTTP server still starts if RabbitMQ is not up yet.
 */
export const connectRabbitMQ = async (): Promise<void> => {
    if (!config.rabbitMqUrl) {
        log.error("RABBITMQ_CONNECTION is not set; chats will not open or close");
        return;
    }
    for (let attempt = 1; ; attempt++) {
        try {
            await setup();
            log.info("RabbitMQ connected. Chat Service is listening for events.");
            return;
        } catch (error) {
            const delay = Math.min(1000 * 2 ** attempt, 15000);
            log.error(`RabbitMQ connect attempt ${attempt} failed: ${error}. Retrying in ${delay}ms`);
            await sleep(delay);
        }
    }
};
