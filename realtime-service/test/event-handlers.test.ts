import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import type {Server} from 'socket.io';
import {createEventHandlers} from '../src/event-handlers.js';

const supplierId = '11111111-1111-4111-8111-111111111111';
const validSupplierEvent = {
    eventId: '22222222-2222-4222-8222-222222222222',
    occurredAt: '2026-01-01T00:00:00Z',
    payload: {supplierId, change: 'DEACTIVATED'},
};

const createHandlers = () => {
    const emissions: {room?: string; event: string; data: unknown}[] = [];
    const socketServer = {
        to(room: string) {
            return {
                emit(event: string, data: unknown) {
                    emissions.push({room, event, data});
                },
            };
        },
        emit(event: string, data: unknown) {
            emissions.push({event, data});
        },
        sockets: {sockets: new Map()},
    };
    const socketServerMock = socketServer as unknown as Server;
    const handlers = createEventHandlers(
        socketServerMock,
    );
    return {emissions, handlers};
};

const body = (value: unknown) => Buffer.from(JSON.stringify(value));

describe('realtime event handlers', () => {
    it('routes user updates from their event type', () => {
        const {emissions, handlers} = createHandlers();

        assert.equal(handlers[0].eventType, 'UserUpdatedEvent');
        handlers[0].handle(body({userId: 'user-1', event: 'order.updated', data: {orderId: 'order-1'}}));

        assert.deepEqual(emissions, [
            {room: 'user:user-1', event: 'order.updated', data: {orderId: 'order-1'}},
        ]);
    });

    it('routes supplier changes from their event type', () => {
        const {emissions, handlers} = createHandlers();

        assert.equal(handlers[1].eventType, 'SupplierChangedEvent');
        handlers[1].handle(body(validSupplierEvent));

        assert.deepEqual(emissions, [{event: 'supplier.changed', data: {supplierId, change: 'DEACTIVATED'}}]);
    });

    it('pushes chat messages to the requester and courier only', () => {
        const {emissions, handlers} = createHandlers();
        const requester = '33333333-3333-4333-8333-333333333333';
        const courier = '44444444-4444-4444-8444-444444444444';
        const message = {
            id: '55555555-5555-4555-8555-555555555555',
            errandId: '66666666-6666-4666-8666-666666666666',
            senderId: requester,
            body: 'Less ice please',
            attachmentType: null,
            sentAt: '2026-01-01T00:00:00Z',
        };

        assert.equal(handlers[2].eventType, 'ErrandMessagePostedEvent');
        handlers[2].handle(body({
            eventId: '22222222-2222-4222-8222-222222222222',
            schemaVersion: 1,
            occurredAt: '2026-01-01T00:00:00Z',
            payload: {
                messageId: message.id,
                errandId: message.errandId,
                senderId: requester,
                recipientIds: [requester, courier],
                body: message.body,
                attachmentType: null,
                sentAt: message.sentAt,
            },
        }));

        assert.deepEqual(emissions, [
            {room: `user:${requester}`, event: 'errand.message', data: message},
            {room: `user:${courier}`, event: 'errand.message', data: message},
        ]);
    });

    it('tells both people when the chat was read', () => {
        const {emissions, handlers} = createHandlers();
        const requester = '33333333-3333-4333-8333-333333333333';
        const courier = '44444444-4444-4444-8444-444444444444';
        const read = {
            errandId: '66666666-6666-4666-8666-666666666666',
            readerId: courier,
            lastReadAt: '2026-01-01T00:00:00Z',
        };

        assert.equal(handlers[3].eventType, 'ErrandChatReadEvent');
        handlers[3].handle(body({
            eventId: '22222222-2222-4222-8222-222222222222',
            schemaVersion: 1,
            occurredAt: '2026-01-01T00:00:01Z',
            payload: {...read, recipientIds: [requester, courier]},
        }));

        assert.deepEqual(emissions, [
            {room: `user:${requester}`, event: 'errand.read', data: read},
            {room: `user:${courier}`, event: 'errand.read', data: read},
        ]);
    });

    it('throws for malformed event bodies so the consumer can reject them', () => {
        const {handlers} = createHandlers();

        assert.throws(() => handlers[2].handle(body({payload: {errandId: supplierId, body: 'no recipients'}})));
        assert.throws(() => handlers[0].handle(body({event: 'missing user id'})));
        assert.throws(() => handlers[1].handle(body({payload: {supplierId, change: 'UNKNOWN'}})));
    });
});
