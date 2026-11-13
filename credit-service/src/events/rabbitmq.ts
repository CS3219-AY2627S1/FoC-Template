/**
 * AI Assistance Disclosure
 * Tool: Gemini (model: 1.5 Pro), date: 2026-10-22
 * Scope: RabbitMQ consumer with connection recovery, mapped to the Order Service's strict routing keys.
 * Author review: Verified exchange assertions, binding keys, and resilient reconnection logic.
 */

import amqp from "amqplib";
import { parseOrderEvent } from "./orderEvent.ts";
import { processOrderEvent } from "./processOrderEvent.ts";


const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE || "orders";
const QUEUE_NAME = "credit_service_orders_queue";

function rabbitmqConnectionUrl(): string {
    const url = new URL(RABBITMQ_URL);
    const user = process.env.RABBITMQ_USER;
    const password = process.env.RABBITMQ_PASSWORD;

    if (user || password) {
        if (!user || !password) {
            throw new Error("Both RABBITMQ_USER and RABBITMQ_PASSWORD must be set");
        }
        url.username = user;
        url.password = password;
    }
    if (!url.username || !url.password) {
        throw new Error("RabbitMQ credentials must be set in the URL or environment");
    }

    return url.toString();
}

type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Channel = Awaited<ReturnType<Connection["createChannel"]>>;

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function connectAndConsume(): Promise<void> {
    try {
        connection = await amqp.connect(rabbitmqConnectionUrl());
        
        connection.on("error", (err: Error) => console.error(`[Credit Service] RabbitMQ connection error: ${err.message}`));
        connection.on("close", () => {
            console.error("[Credit Service] RabbitMQ connection closed. Reconnecting in 5s...");
            connection = null;
            channel = null;
            setTimeout(connectAndConsume, 5000);
        });

        channel = await connection.createChannel();
        
        channel.on("error", (err: Error) => console.error(`[Credit Service] RabbitMQ channel error: ${err.message}`));
        channel.on("close", () => {
            channel = null;
        });

        await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
        
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, "order.completed");
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, "order.cancelled");
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, "order.expired");

        channel.prefetch(1);

        console.log(`[*] Credit Service waiting for messages in ${QUEUE_NAME} on exchange ${EXCHANGE_NAME}`);

        channel.consume(QUEUE_NAME, async (msg) => {
            if (!msg) return;

            const routingKey = msg.fields.routingKey;
            const messageId = msg.properties.messageId; 

            try {
                const event = parseOrderEvent(JSON.parse(msg.content.toString()));
                await processOrderEvent(event);
                console.log(
                    `[v] Processed ${event.event_type} for order ${event.data.order_id} (${routingKey}, ${event.event_id})`
                );

                channel!.ack(msg);

            } catch (error: any) {
                console.error(`[X] Error processing ${routingKey} (MsgID: ${messageId}):`, error.message);
                
                channel!.nack(msg, false, false);
            }
        }, { noAck: false });

    } catch (error) {
        console.error("[Credit Service] Failed to connect to RabbitMQ. Retrying in 5s...", error);
        setTimeout(connectAndConsume, 5000);
    }
}