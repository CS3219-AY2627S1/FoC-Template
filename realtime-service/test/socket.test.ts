import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {Server} from 'socket.io';
import type {Socket} from 'socket.io';
import {broadcast, createSocketIoServer, emitToUser} from '../src/socket.js';

type Emission = {room?: string; event: string; data: unknown};

const recordingServer = () => {
    const emissions: Emission[] = [];
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
    };
    return {emissions, socketServer: socketServer as unknown as Server};
};

describe('Socket.IO client functions', () => {
    it('sends user events only to that user room', () => {
        const {emissions, socketServer} = recordingServer();

        emitToUser(socketServer, 'user-1', 'order.updated', {orderId: 'order-1'});

        assert.deepEqual(emissions, [
            {room: 'user:user-1', event: 'order.updated', data: {orderId: 'order-1'}},
        ]);
    });

    it('broadcasts an event to every socket', () => {
        const {emissions, socketServer} = recordingServer();
        const eventData = {supplierId: 'supplier-1', change: 'DEACTIVATED'};

        broadcast(socketServer, 'supplier.changed', eventData);

        assert.deepEqual(emissions, [{event: 'supplier.changed', data: eventData}]);
    });
});

describe('Socket.IO authentication', () => {
    it('rejects verification failures with a generic error', async () => {
        const use = mock.method(Server.prototype, 'use');
        try {
            createSocketIoServer('https://example.test/jwks');
            const middleware = use.mock.calls[0].arguments[0];
            const socket = {handshake: {auth: {token: 'invalid-token'}}, data: {}} as unknown as Socket;
            const next = mock.fn();

            await middleware(socket, next);

            assert.equal(next.mock.callCount(), 1);
            assert.equal(socket.data.userId, undefined);
            const error = next.mock.calls[0].arguments[0];
            assert.ok(error instanceof Error);
            assert.equal(error.message, 'Unauthorized');
        } finally {
            use.mock.restore();
        }
    });
});
