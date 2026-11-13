import {z} from 'zod';

export const userUpdateEventSchema = z.object({
    userId: z.string(),
    event: z.string(),
    data: z.json(),
});

export type UserUpdateEvent = z.infer<typeof userUpdateEventSchema>;

export const parseUserUpdateEvent = (body: Buffer): UserUpdateEvent =>
    userUpdateEventSchema.parse(JSON.parse(body.toString('utf8')));



export const supplierChangedEventSchema = z.object({
    eventId: z.uuid(),
    occurredAt: z.iso.datetime({offset: true}),
    payload: z.object({
        supplierId: z.uuid(),
        change: z.enum(['CREATED', 'UPDATED', 'ACTIVATED', 'DEACTIVATED', 'IMAGE_CHANGED']),
    }),
});

export type SupplierChangedEvent = z.infer<typeof supplierChangedEventSchema>;

export const parseSupplierChangedEvent = (body: Buffer): SupplierChangedEvent =>
    supplierChangedEventSchema.parse(JSON.parse(body.toString('utf8')));

export const errandMessagePostedEventSchema = z.object({
    eventId: z.uuid(),
    occurredAt: z.iso.datetime({offset: true}),
    payload: z.object({
        messageId: z.uuid(),
        errandId: z.uuid(),
        senderId: z.uuid(),
        recipientIds: z.array(z.uuid()).min(1),
        // null for a photo or video without text
        body: z.string().min(1).nullable(),
        attachmentType: z.enum(['IMAGE', 'VIDEO']).nullable(),
        sentAt: z.iso.datetime({offset: true}),
    }),
});

export type ErrandMessagePostedEvent = z.infer<typeof errandMessagePostedEventSchema>;

export const parseErrandMessagePostedEvent = (body: Buffer): ErrandMessagePostedEvent =>
    errandMessagePostedEventSchema.parse(JSON.parse(body.toString('utf8')));

export const errandChatReadEventSchema = z.object({
    eventId: z.uuid(),
    occurredAt: z.iso.datetime({offset: true}),
    payload: z.object({
        errandId: z.uuid(),
        readerId: z.uuid(),
        recipientIds: z.array(z.uuid()).min(1),
        lastReadAt: z.iso.datetime({offset: true}),
    }),
});

export type ErrandChatReadEvent = z.infer<typeof errandChatReadEventSchema>;

export const parseErrandChatReadEvent = (body: Buffer): ErrandChatReadEvent =>
    errandChatReadEventSchema.parse(JSON.parse(body.toString('utf8')));
