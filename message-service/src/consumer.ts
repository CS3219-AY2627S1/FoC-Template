import { connect, type ConsumeMessage } from "amqplib";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";
import { messageUser } from "./services/message.service.ts";

const EXCHANGE = "relay.events";
const DEAD_EXCHANGE = "relay.dead";
const QUEUE = "message-service.messages";
const EVENT_TYPE = "user.account.activated";
const RETRY_MS = 5000;


export async function startMessageConsumer(): Promise<void> {
    try {
        const connection = await connect(config.BROKER_URL);
        connection.on("error", () => { });
        connection.on("close", () => setTimeout(() => void startMessageConsumer(), RETRY_MS));

        const channel = await connection.createChannel();
        // A channel error would otherwise crash the process, or leave a connection that consumes nothing.
        // Closing the connection goes through the reconnect above.
        channel.on("error", (err) => {
            logger.error({ err }, "broker channel failed, reconnecting");
            connection.close().catch(() => { });
        });
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
                // An empty id could never be saved, so retrying it would loop forever.
                if (typeof accountId !== "string" || !accountId.trim() || typeof eventId !== "string") throw new Error("missing ids");
            } catch (err) {
                logger.warn({ err }, "malformed event, dead-lettering");
                channel.nack(message, false, false); //Negative acknowledgement
                return;
            }
            try {
                await messageUser(accountId);
                channel.ack(message);
                logger.info({ eventId, accountId }, "welcome message handled");
            } catch (err) {
                logger.error({ err, eventId }, "event failed, will retry");
                setTimeout(() => {
                    try {
                        channel.nack(message, false, true); // temporary: requeue
                    } catch {
                        // The channel closed during the pause. The broker redelivers an unacknowledged message by itself.
                        logger.warn({ eventId }, "channel closed before requeue, broker will redeliver");
                    }
                }, RETRY_MS);
            }
        });

        logger.info({ queue: QUEUE, eventType: EVENT_TYPE }, "consuming events");
    } catch (err) {
        logger.warn({ err }, "broker connect failed, will retry");
        setTimeout(() => void startMessageConsumer(), RETRY_MS);
    }
}
