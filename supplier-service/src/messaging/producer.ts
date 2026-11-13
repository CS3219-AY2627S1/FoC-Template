// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: generated supplier event producer and its single broker connection.
// Author review: Looks good, includes appropriate schema, my 2 events and now integrates with shared queue bindings.
/*
Publishes supplier catalogue changes to the supplier.events topic exchange.
The routing key is the event type; order-service receives these through the
order.supplier-events bindings and refreshes its supplier cache.

  supplier.updated  - after a supplier is created or updated
  supplier.deleted  - after a supplier is soft deleted

Publishing happens after the database write has committed, so a failed publish is
logged and never turns a successful request into an error. order-service's cache
TTL bounds how long a missed event can leave it stale.
*/

import { randomUUID } from 'node:crypto';
import {
    EXCHANGES,
    RabbitMQClient,
    supplierDeletedSchema,
    supplierUpdatedSchema,
    type SupplierDeleted,
    type SupplierUpdated,
} from '@foc/messaging';
import type { PublicSupplier } from '@data/schema';

export type Publisher = Pick<RabbitMQClient, 'publishToExchange'>;
export type SupplierEvent = SupplierUpdated | SupplierDeleted;

export function toSupplierUpdated(row: PublicSupplier, now = new Date()): SupplierUpdated {
    return supplierUpdatedSchema.parse({
        type: 'supplier.updated',
        eventId: randomUUID(),
        occurredAt: now.toISOString(),
        updatedAt: (row.updatedAt ?? now).toISOString(),
        supplierId: String(row.supplierId),
        name: row.name,
        supplierType: row.type,
        buildingName: row.buildingName,
        locationDescription: row.locationDescription,
        floor: Number(row.floor),
        //numeric columns come back from pg as strings; the contract carries strings
        latitude: String(row.latitude),
        longitude: String(row.longitude),
        ...(row.imageURL ? { imageUrl: row.imageURL } : {}),
    });
}

export function toSupplierDeleted(row: PublicSupplier, now = new Date()): SupplierDeleted {
    return supplierDeletedSchema.parse({
        type: 'supplier.deleted',
        eventId: randomUUID(),
        occurredAt: now.toISOString(),
        //a soft delete leaves updated_at alone, so the delete time orders it after every earlier update
        updatedAt: now.toISOString(),
        supplierId: String(row.supplierId),
    });
}

export class SupplierMessagingProducer {
    constructor(private readonly broker: () => Publisher | undefined) {}

    publishSupplierUpdated(row: PublicSupplier): Promise<boolean> {
        return this.publish(row, toSupplierUpdated);
    }

    publishSupplierDeleted(row: PublicSupplier): Promise<boolean> {
        return this.publish(row, toSupplierDeleted);
    }

    //never rejects: callers have already committed the write
    private async publish(row: PublicSupplier, build: (row: PublicSupplier) => SupplierEvent): Promise<boolean> {
        const broker = this.broker();
        if (!broker) return false;
        try {
            const event = build(row);
            const sent = await broker.publishToExchange(EXCHANGES.supplier, event.type, event, event.eventId);
            if (!sent) {
                console.error('Supplier event rejected by broker', { type: event.type, eventId: event.eventId, supplierId: event.supplierId });
            }
            return sent;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('Supplier event not published', { supplierId: String(row.supplierId), message });
            return false;
        }
    }
}

let client: RabbitMQClient | undefined;
let connected: RabbitMQClient | undefined;
let retryTimer: NodeJS.Timeout | undefined;
let stopped = false;

export const supplierEvents = new SupplierMessagingProducer(() => connected);

//Connects in the background so supplier CRUD keeps working while the broker is down.
export function startSupplierEvents(url = process.env.RABBITMQ_URL): void {
    if (!url) {
        console.info('Supplier event publishing disabled: RABBITMQ_URL not configured');
        return;
    }
    if (client) return;
    stopped = false;
    const broker = client = new RabbitMQClient({ url, serviceName: 'supplier-service', prefetch: 10 });
    const attempt = (delayMs: number): void => {
        broker.connect().then(() => {
            if (stopped) return void broker.close().catch(() => undefined);
            connected = broker;
            console.info('Supplier event publishing ready', { exchange: EXCHANGES.supplier });
        }).catch((err: unknown) => {
            if (stopped) return;
            const message = err instanceof Error ? err.message : String(err);
            console.error('Supplier event broker unavailable', { message, retryInMs: delayMs });
            retryTimer = setTimeout(() => attempt(Math.min(delayMs * 2, 30_000)), delayMs);
        });
    };
    attempt(1_000);
}

export async function stopSupplierEvents(): Promise<void> {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = undefined;
    const broker = client;
    client = undefined;
    connected = undefined;
    await broker?.close();
}
