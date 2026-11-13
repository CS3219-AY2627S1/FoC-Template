import config from "../../config.ts";
import amqp from "amqplib";
import { RabbitMqProvider } from "../provider.ts";

const defaultChannelSetup = async (ch: amqp.ConfirmChannel) => {
    // main router: publishes to interested services (which are their own queues)
    await ch.assertExchange("app.events", "topic", { durable: true });
    await ch.assertExchange("app.rpc", "direct", { durable: true });
    await ch.assertExchange("app.dlx", "topic", { durable: true });

    // example of use in another 
    // await this.ch.assertQueue("credit.user-registered", {
    //     durable: true,
    //     // deadLetterExchange: "app.dlx",
    //     // deadLetterRoutingKey: "credit.user-registered.dlq",
    // });
    // await this.ch.bindQueue("credit.user-registered", "app.events", "user.registered");

    await ch.assertQueue("user.rpc", { durable: true });
    await ch.bindQueue("user.rpc", "app.rpc", "user.query");
}

export const buildDefaultProvider = async () => {
    if (!config.rabbitMqConnectionString) {
        throw new Error("rabbitmq connection string not found in config");
    }
    const provider = await RabbitMqProvider.connect(config.rabbitMqConnectionString!, defaultChannelSetup);
    return provider;
}