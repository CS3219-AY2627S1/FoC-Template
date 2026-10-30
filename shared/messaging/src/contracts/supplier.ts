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
  eventId: z.string(),
  occurredAt: z.string(),
  /** Decimal string; matches the gRPC uint64 wire format. */
  supplierId: z.string(),
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
