import config from "../../config.ts";
import amqp from "amqplib";
import { RabbitMqProvider } from "../provider.ts";
import { consumeUserRegistered } from "./userRegistered.ts";
import { consumeOrderCreated } from "./orderCreated.ts";
import { consumeOrderReleased } from "./orderReleased.ts";
import { consumeOrderRefunded } from "./orderRefunded.ts";
import { consumeOrderAccepted } from "./orderAccepted.ts";
import { TransientReplyQueue } from "../transientReplyQueue.ts";
import { setUserReplyQueue } from "./rpc.ts";

const defaultChannelSetup = async (ch: amqp.ConfirmChannel) => {
    // main router: publishes to interested services (which are their own queues)
    await ch.assertExchange("app.events", "topic", { durable: true });
    await ch.assertExchange("app.rpc", "direct", { durable: true });
    await ch.assertExchange("app.dlx", "topic", { durable: true });

    const queues = [
        "credit.user-registered",
        "credit.order-created",
        "credit.order-accepted",
        "credit.order-released",
        "credit.order-refunded",
    ];

    for (const queue of queues) {
        const deadLetterQueue = `${queue}.dlq`;
        // Prepare the destination before the source can dead-letter messages.
        await ch.assertQueue(deadLetterQueue, { durable: true });
        await ch.bindQueue(deadLetterQueue, "app.dlx", deadLetterQueue);

        await ch.assertQueue(queue, {
            durable: true,
            deadLetterExchange: "app.dlx",
            deadLetterRoutingKey: deadLetterQueue,
        });
    }

    await ch.bindQueue(
        "credit.order-created",
        "app.events",
        "order.created"
    )

    await ch.bindQueue(
        "credit.order-accepted",
        "app.events",
        "order.accepted"
    )

    await ch.bindQueue(
        "credit.order-released",
        "app.events",
        "order.completed"
    )

    
    await ch.bindQueue(
        "credit.order-refunded",
        "app.events",
        "order.cancelled"
    )

    await ch.bindQueue(
        "credit.user-registered",
        "app.events",
        "user.registered",
    );

    const userReplies = new TransientReplyQueue(ch, 5000, 1000);
    ch.once("close", () => userReplies.handleDisconnect());
    await userReplies.start();
    setUserReplyQueue(userReplies);

    await ch.prefetch(10);
    await consumeUserRegistered(ch);
    await consumeOrderCreated(ch);
    await consumeOrderAccepted(ch);
    await consumeOrderReleased(ch);
    await consumeOrderRefunded(ch);
}

export const buildDefaultProvider = async () => {
    if (!config.rabbitMqConnectionString) {
        throw new Error("rabbitmq connection string not found in config");
    }
    const provider = await RabbitMqProvider.connect(config.rabbitMqConnectionString!, defaultChannelSetup);
    return provider;
}
