import { connect, type ConsumeMessage } from "amqplib";
import { z } from "zod";
import { logger } from "./lib/logger.ts";
import type { CompletedErrand, FeatureStore, TrainingSample } from "./feature-store.ts";
import type { RecommendationLog } from "./recommendation-log.ts";

const CompletedEventSchema = z.object({
    eventId: z.string().min(1),
    type: z.literal("order.errand.completed"),
    data: z.object({
        supplierId: z.string().min(1).refine(id => !id.startsWith("__event#")),
        creditReward: z.number().nonnegative().optional(),
        reward: z.number().nonnegative().optional(),
        itemCount: z.number().int().nonnegative(),
        distance: z.number().nonnegative().nullish().transform(value => value ?? undefined),
        neededBy: z.string().optional(),
        postedAt: z.string().optional(),
    }).refine(data => data.creditReward !== undefined || data.reward !== undefined),
});

export function parseCompletedEvent(value: unknown): CompletedErrand {
    const { eventId, data } = CompletedEventSchema.parse(value);
    return {
        eventId, supplierId: data.supplierId, reward: data.creditReward ?? data.reward!, itemCount: data.itemCount,
        ...(data.distance === undefined ? {} : { distance: data.distance }),
        ...(data.neededBy === undefined ? {} : { neededBy: data.neededBy }),
        ...(data.postedAt === undefined ? {} : { postedAt: data.postedAt }),
    };
}

export async function applyCompletedErrand(store: FeatureStore, errand: CompletedErrand, training?: RecommendationLog<TrainingSample>): Promise<void> {
    const sample = await store.apply(errand);
    if (sample && training) await training.recordDurably(sample, errand.eventId);
}

const BROKER_URL = process.env.BROKER_URL ?? "amqp://relay:change-me@localhost:5672";
const EXCHANGE = "relay.events";
const DEAD_EXCHANGE = "relay.dead";
const QUEUE = "recommendation-service.orders";
const EVENT_TYPE = "order.errand.completed";
const RETRY_MS = 5000;

export async function startErrandConsumer(store: FeatureStore, training?: RecommendationLog<TrainingSample>): Promise<void> {
    try {
        const connection = await connect(BROKER_URL);
        connection.on("error", () => {});
        connection.on("close", () => setTimeout(() => void startErrandConsumer(store, training), RETRY_MS));

        const channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE, "topic", { durable: true });
        await channel.assertExchange(DEAD_EXCHANGE, "topic", { durable: true });
        await channel.assertQueue(QUEUE, { durable: true, deadLetterExchange: DEAD_EXCHANGE, deadLetterRoutingKey: QUEUE });
        await channel.assertQueue(`${QUEUE}.dead`, { durable: true });
        await channel.bindQueue(`${QUEUE}.dead`, DEAD_EXCHANGE, QUEUE);
        await channel.bindQueue(QUEUE, EXCHANGE, EVENT_TYPE);
        await channel.prefetch(10);

        await channel.consume(QUEUE, async (message: ConsumeMessage | null) => {
            if (!message) return;
            let errand: CompletedErrand;
            try {
                errand = parseCompletedEvent(JSON.parse(message.content.toString()));
            } catch {
                channel.nack(message, false, false);
                return;
            }
            try {
                await applyCompletedErrand(store, errand, training);
                logger.info({ eventId: errand.eventId, supplierId: errand.supplierId }, "applied completed errand");
                channel.ack(message);
            } catch (err) {
                logger.error({ eventId: errand.eventId, err }, "errand apply failed, will retry");
                setTimeout(() => channel.nack(message, false, true), RETRY_MS);
            }
        });
        logger.info({ queue: QUEUE, eventType: EVENT_TYPE }, "consuming completed errands");
    } catch (err) {
        logger.error({ err }, "broker connect failed, will retry");
        setTimeout(() => void startErrandConsumer(store, training), RETRY_MS);
    }
}
