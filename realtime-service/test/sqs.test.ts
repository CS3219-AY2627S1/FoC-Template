import assert from 'node:assert/strict';
import {it, mock} from 'node:test';
import {DeleteMessageCommand, ReceiveMessageCommand, SQSClient} from '@aws-sdk/client-sqs';
import pino from 'pino';
import {createSqsEventConsumer} from '../src/sqs.js';

it('acknowledges handled events, retains failed events for retry, and aborts long polling on shutdown', {timeout: 2000}, async () => {
    const client = new SQSClient({region: 'ap-southeast-1'});
    const deleted: string[] = [];
    let polled = false;
    let reachedNextPoll!: () => void;
    const nextPoll = new Promise<void>((resolve) => { reachedNextPoll = resolve; });
    mock.method(client, 'send', async (command: unknown, options?: {abortSignal?: AbortSignal}) => {
        if (command instanceof DeleteMessageCommand) {
            deleted.push(command.input.ReceiptHandle!);
            return {};
        }
        assert.ok(command instanceof ReceiveMessageCommand);
        if (polled) {
            reachedNextPoll();
            return new Promise((resolve) => {
                options?.abortSignal?.addEventListener('abort', () => resolve({}), {once: true});
            });
        }
        polled = true;
        return {Messages: [
            {Body: 'valid', ReceiptHandle: 'success', MessageAttributes: {eventType: {StringValue: 'SupplierChangedEvent'}}},
            {Body: 'invalid', ReceiptHandle: 'failure', MessageAttributes: {eventType: {StringValue: 'SupplierChangedEvent'}}},
            {Body: 'unknown', ReceiptHandle: 'unknown', MessageAttributes: {eventType: {StringValue: 'UnsupportedEvent'}}},
        ]};
    });
    const consumer = createSqsEventConsumer('https://sqs.example.test/queue', client, pino({enabled: false}));
    consumer.start([{
        eventType: 'SupplierChangedEvent',
        handle(body) { if (body.toString() === 'invalid') throw new Error('Invalid event'); },
    }]);
    await nextPoll;
    await consumer.close();
    assert.deepEqual(deleted, ['success']);
});
