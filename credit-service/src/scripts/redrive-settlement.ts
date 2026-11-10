import { settlementEventSchema } from "../schemas/settlement-event.schema.js";
import {
    connectSettlementMessaging,
    publishConfirmed,
    SETTLEMENT_MESSAGING,
} from "../libs/rabbitmq.js";
import { MAX_SETTLEMENT_BYTES } from "../constants/consumer.constant.js";

const usage = "Usage: npm run redrive:settlement -- --limit <positive integer>";

async function redrive(limit: number): Promise<void> {
    const { connection, channel } = await connectSettlementMessaging();
    try {
        // Bound this run by both the requested limit and the initial ready count.
        const { messageCount } = await channel.checkQueue(SETTLEMENT_MESSAGING.deadQueue);
        const count = Math.min(limit, messageCount);
        let forwarded = 0;
        for (let index = 0; index < count; index++) {
            const message = await channel.get(SETTLEMENT_MESSAGING.deadQueue, { noAck: false });
            if (!message) break;

            let payload: unknown;
            try {
                if (message.content.length > MAX_SETTLEMENT_BYTES) throw new Error("INVALID_EVENT");
                payload = JSON.parse(message.content.toString("utf8"));
            } catch {
                throw new Error("INVALID_EVENT");
            }
            const event = settlementEventSchema.safeParse(payload);
            if (!event.success || message.properties.messageId !== event.data.eventId) {
                throw new Error("INVALID_EVENT");
            }
            const previousCount: unknown = message.properties.headers?.["x-redrive-count"] ?? 0;
            if (typeof previousCount !== "number" || !Number.isSafeInteger(previousCount)
                || previousCount < 0 || previousCount >= Number.MAX_SAFE_INTEGER) {
                throw new Error("INVALID_REDRIVE_COUNT");
            }

            await publishConfirmed(
                channel,
                SETTLEMENT_MESSAGING.exchange,
                SETTLEMENT_MESSAGING.routingKeys[event.data.eventType],
                message.content, // Preserve exact event bytes.
                {
                    messageId: message.properties.messageId,
                    contentType: message.properties.contentType ?? "application/json",
                    correlationId: message.properties.correlationId,
                    headers: {
                        ...message.properties.headers,
                        "x-retry-count": 0,
                        "x-redrive-count": previousCount + 1,
                        "x-redriven-at": new Date().toISOString(),
                    },
                },
            );
            channel.ack(message);
            forwarded++;
            console.info("Settlement redrive", {
                eventId: event.data.eventId,
                reservationId: event.data.reservationId,
                attempt: 0,
                redriveCount: previousCount + 1,
                outcome: "redriven",
            });
        }
        console.info("Settlement redrive", { outcome: "complete", forwarded });
    } finally {
        // Failure or interruption before ack leaves the original available for
        // redelivery. A lost ack can duplicate an event, never another balance mutation.
        // Flush acknowledgments on this channel before closing the connection.
        await channel.close().catch(() => undefined);
        await connection.close().catch(() => undefined);
    }
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
    console.info(usage);
} else if (args.length !== 2 || args[0] !== "--limit"
    || !/^[1-9]\d*$/.test(args[1] ?? "") || !Number.isSafeInteger(Number(args[1]))) {
    console.error(usage);
    process.exitCode = 1;
} else {
    try {
        await redrive(Number(args[1]));
    } catch (error) {
        // Do not print raw broker errors, which may contain connection details.
        const reason = error instanceof Error
            && ["INVALID_EVENT", "INVALID_REDRIVE_COUNT"].includes(error.message)
            ? error.message : "BROKER_OPERATION_FAILED";
        console.error("Settlement redrive", { outcome: "stopped", reason });
        process.exitCode = 1;
    }
}
