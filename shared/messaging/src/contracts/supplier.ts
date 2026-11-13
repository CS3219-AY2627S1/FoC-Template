// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: add in supplier/order pub-sub works for the supplier cache.
// Scope: updatedAt version field and stricter eventId/occurredAt/supplierId validation.
// Author review: Approved event base schema by @sunpterodactyl.
//message producer

import { z } from 'zod';

export const openingHoursDaySchema = z.object({
  dayOfWeek: z.number(),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  isClosed: z.boolean(),
});
export type OpeningHoursDay = z.infer<typeof openingHoursDaySchema>;

const supplierEventBaseSchema = z.object({
  eventId: z.string().trim().min(1),
  occurredAt: z.iso.datetime({ offset: true }),
  /** Decimal string; matches the gRPC uint64 wire format. */
  supplierId: z.string().regex(/^[1-9][0-9]*$/),
  /** Supplier row updated_at after the write; for supplier.deleted, the time of the soft delete. Consumers order events by it. */
  updatedAt: z.iso.datetime({ offset: true }),
});

export const supplierUpdatedSchema = supplierEventBaseSchema.extend({
  type: z.literal('supplier.updated'),
  name: z.string(),
  supplierType: z.string(),
  buildingName: z.string(),
  locationDescription: z.string(),
  floor: z.number(),
  latitude: z.string(),
  longitude: z.string(),
  imageUrl: z.string().optional(),
});

export const supplierStatusChangedSchema = supplierEventBaseSchema.extend({
  type: z.literal('supplier.status_changed'),
  openingHours: z.array(openingHoursDaySchema),
});

export const supplierDeletedSchema = supplierEventBaseSchema.extend({
  type: z.literal('supplier.deleted'),
});

export const supplierEventSchema = z.discriminatedUnion('type', [
  supplierUpdatedSchema,
  supplierStatusChangedSchema,
  supplierDeletedSchema,
]);

export type SupplierUpdated = z.infer<typeof supplierUpdatedSchema>;
export type SupplierStatusChanged = z.infer<typeof supplierStatusChangedSchema>;
export type SupplierDeleted = z.infer<typeof supplierDeletedSchema>;
export type SupplierEvent = z.infer<typeof supplierEventSchema>;
