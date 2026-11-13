import { connect, type ConsumeMessage } from "amqplib";
import { createAccount } from "./services/accountService.ts";
import { transferCredits, releaseCredits } from "./services/reservationService.ts";
import { handleOrderEvent } from "./order-events.ts";

const BROKER_URL = process.env.BROKER_URL ?? "amqp://relay:change-me@localhost:5672";
const EXCHANGE = "relay.events";
const DEAD_EXCHANGE = "relay.dead";
const QUEUE = "credit-service.accounts";
const EVENT_TYPE = "user.account.activated";
const RETRY_MS = 5000;

// REL-83 / F4.1.1 to F4.1.3: create the credit account when the user-service announces an
// activated account. Idempotent (createAccount deduplicates by accountId, so a repeated event is
// a no-op), acks only after the account exists, dead-letters a malformed message and requeues a
// temporary failure. Reconnects on drop so the service starts and serves while the broker is down;
// announcements wait in the user-service until this queue exists.
export async function startAccountConsumer(): Promise<void> {
    try {
        const connection = await connect(BROKER_URL);
        connection.on("error", () => {});
        connection.on("close", () => setTimeout(() => void startAccountConsumer(), RETRY_MS));

        const channel = await connection.createChannel();
        channel.on("error", (err) => console.error("broker channel failed:", err));
        await channel.assertExchange(EXCHANGE, "topic", { durable: true });
        await channel.assertExchange(DEAD_EXCHANGE, "topic", { durable: true });
        await channel.assertQueue(QUEUE, { durable: true, deadLetterExchange: DEAD_EXCHANGE, deadLetterRoutingKey: QUEUE });
        await channel.assertQueue(`${QUEUE}.dead`, { durable: true });
        await channel.bindQueue(`${QUEUE}.dead`, DEAD_EXCHANGE, QUEUE);
        await channel.bindQueue(QUEUE, EXCHANGE, EVENT_TYPE);
        await channel.prefetch(10);

        await channel.consume(QUEUE, async (message: ConsumeMessage | null) => {
            if (!message) return;
            let accountId: string;
            let eventId: string;
            try {
                const event = JSON.parse(message.content.toString());
                accountId = event.data.accountId;
                eventId = event.eventId;
                if (typeof accountId !== "string" || typeof eventId !== "string") throw new Error("missing ids");
            } catch {
                channel.nack(message, false, false); // malformed: dead-letter to credit-service.accounts.dead
                return;
            }
            try {
                await createAccount(accountId);
                console.log(`credit account ready for ${accountId} (event ${eventId})`);
                channel.ack(message);
            } catch (err) {
                console.error(`event ${eventId} failed, will retry:`, err);
                setTimeout(() => channel.nack(message, false, true), RETRY_MS); // temporary: requeue
            }
        });
        console.log(`consuming ${EVENT_TYPE} on ${QUEUE}`);

        const orderQueue = "credit-service.orders";
        await channel.assertQueue(orderQueue, { durable: true, deadLetterExchange: DEAD_EXCHANGE, deadLetterRoutingKey: orderQueue });
        await channel.assertQueue(`${orderQueue}.dead`, { durable: true });
        await channel.bindQueue(`${orderQueue}.dead`, DEAD_EXCHANGE, orderQueue);
        for (const type of ["order.errand.completed", "order.errand.cancelled", "order.errand.expired"]) {
            await channel.bindQueue(orderQueue, EXCHANGE, type);
        }
        await channel.consume(orderQueue, async (message: ConsumeMessage | null) => {
            if (!message) return;
            try {
                await handleOrderEvent(JSON.parse(message.content.toString()), { transfer: transferCredits, release: releaseCredits });
                channel.ack(message);
                console.log(`credit request handled (event ${message.properties.messageId})`);
            } catch (err) {
                if (err instanceof SyntaxError || (err instanceof Error && err.message === "MALFORMED_ORDER_EVENT")) {
                    channel.nack(message, false, false);
                } else {
                    console.error(`credit request ${message.properties.messageId} failed, will retry:`, err);
                    setTimeout(() => {
                        try { channel.nack(message, false, true); } catch { /* A closed channel requeues its unacked messages. */ }
                    }, RETRY_MS);
                }
            }
        });
    } catch (err) {
        console.error("broker connect failed, will retry:", err);
        setTimeout(() => void startAccountConsumer(), RETRY_MS);
    }
}
