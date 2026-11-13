import {DeleteMessageCommand, ReceiveMessageCommand, SQSClient, type Message} from '@aws-sdk/client-sqs';
import {setTimeout} from 'node:timers/promises';
import type {Logger} from 'pino';

export type EventHandler = {
    eventType: string;
    handle: (body: Buffer) => void;
};

export const createSqsEventConsumer = (queueUrl: string, client: SQSClient, logger: Logger) => {
    const shutdownController = new AbortController();
    const {signal} = shutdownController;
    let pollingTask: Promise<void> | undefined;

    const receiveMessages = async (): Promise<Message[]> => {
        try {
            const response = await client.send(new ReceiveMessageCommand({
                QueueUrl: queueUrl,
                WaitTimeSeconds: 20,
                MaxNumberOfMessages: 10,
                MessageAttributeNames: ['eventType'],
            }), {abortSignal: signal});
            return response.Messages ?? [];
        } catch (error: unknown) {
            if (signal.aborted) return [];
            logger.error({err: error}, 'SQS receive failed');
            await setTimeout(1000, undefined, {signal}).catch((error: unknown) => {
                if (!signal.aborted) throw error;
            });
            return [];
        }
    };

    const handleAndAcknowledge = async (message: Message, handlers: EventHandler[]): Promise<void> => {
        const eventType = message.MessageAttributes?.eventType?.StringValue;
        const handler = handlers.find((item) => item.eventType === eventType);
        if (!handler || !message.Body || !message.ReceiptHandle) {
            logger.warn({eventType, messageId: message.MessageId}, 'Leaving invalid or unsupported SQS event for retry');
            return;
        }

        try {
            handler.handle(Buffer.from(message.Body));
            await client.send(new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: message.ReceiptHandle,
            }), {abortSignal: signal});
        } catch (error: unknown) {
            if (signal.aborted) return;
            // Leave failed messages for retry and the queue's configured DLQ redrive policy.
            logger.warn({err: error, messageId: message.MessageId}, 'SQS event handling or acknowledgement failed');
        }
    };

    const poll = async (handlers: EventHandler[]): Promise<void> => {
        while (!signal.aborted) {
            const messages = await receiveMessages();
            for (const message of messages) {
                if (signal.aborted) return;
                await handleAndAcknowledge(message, handlers);
            }
        }
    };

    return {
        start(handlers: EventHandler[]): void {
            if (pollingTask) throw new Error('SQS consumer already started');
            pollingTask = poll(handlers);
        },
        async close(): Promise<void> {
            shutdownController.abort();
            await pollingTask;
            client.destroy();
        },
    };
};
