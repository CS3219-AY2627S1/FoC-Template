import type {Server} from 'socket.io';
import type {EventHandler} from './sqs.js';
import {broadcast, emitToUser} from './socket.js';
import {
    parseErrandChatReadEvent,
    parseErrandMessagePostedEvent,
    parseSupplierChangedEvent,
    parseUserUpdateEvent,
} from './events.js';

export const createEventHandlers = (
    socketServer: Server,
): EventHandler[] => [
    {
        eventType: 'UserUpdatedEvent',
        handle: (body) => {
            const event = parseUserUpdateEvent(body);
            emitToUser(socketServer, event.userId, event.event, event.data);
        },
    },
    {
        eventType: 'SupplierChangedEvent',
        handle: (body) => broadcast(socketServer, 'supplier.changed', parseSupplierChangedEvent(body).payload),
    },
    {
        // chat: push the message to the requester and the courier, each may have several tabs open
        eventType: 'ErrandMessagePostedEvent',
        handle: (body) => {
            const {messageId, recipientIds, ...message} = parseErrandMessagePostedEvent(body).payload;
            for (const userId of new Set(recipientIds)) {
                emitToUser(socketServer, userId, 'errand.message', {id: messageId, ...message});
            }
        },
    },
    {
        // chat: someone read the conversation, so the sender can see "Seen"
        eventType: 'ErrandChatReadEvent',
        handle: (body) => {
            const {recipientIds, ...read} = parseErrandChatReadEvent(body).payload;
            for (const userId of new Set(recipientIds)) emitToUser(socketServer, userId, 'errand.read', read);
        },
    },
];
