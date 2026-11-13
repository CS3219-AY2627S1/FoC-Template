/*
Drizzle relations between supplier and its opening hours.

These live outside the table files on purpose: schema.ts imports opening-hours-schema.ts
for createOpeningHoursSchema, so declaring relations(supplier, ...) inside
opening-hours-schema.ts reads `supplier` before that import resolves.
*/

import { relations } from 'drizzle-orm';
import { supplier } from '@data/schema';
import { supplierOpeningHours } from '@data/opening-hours-schema';

export const supplierRelations = relations(supplier, ({ many }) => ({
  openingHours: many(supplierOpeningHours),
}));

export const openingHoursRelations = relations(supplierOpeningHours, ({ one }) => ({
  supplier: one(supplier, {
    fields: [supplierOpeningHours.supplierId], //make sure to join FK with PK
    references: [supplier.supplierId],
  }),
}));
