/*
All interfaces are in one file. Refactor into different files for greater readability if needed.
Zod schemas for request validation are derived from the drizzle table.

AI Declaration: Migration to drizzle performed by Cursor and reviewed/edited by @sunpterodactyl
*/

import { bigint, integer, numeric, pgTable, timestamp, varchar, uniqueIndex} from 'drizzle-orm/pg-core';
import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import {sql} from 'drizzle-orm'
import {createOpeningHoursSchema, PublicOpeningHours} from '@data/opening-hours-schema';

export const SUPPLIER_CATEGORY = z.enum(['food/coffee', 'printing', 'food', 'shopping', 'other']);

/*
supplier schema in drizzle to support query building

Required Fields (Cannot be Null)
- supplierId : 'id' in database
- name: "Name" in database
- type: "Type" in database
- buildingName: "Building" in database
- locationDescription: "Location Description"in database
- floor : "Floor" in database
- longitude: "Longitude" in database
- latitude: "Latitude" in database

Optional Fields (Initialized with default value)
- startingTime "StartingTime" in database
- closingTime "ClosingTime" in database
- imageURL "ImageURL" in database

System Details [Cannot be Manually Updated] 
- deletedAt "deleted_at" in database
- createdAt "created_at" in database 
- updatedAt "updated_at" in database
*/

export const supplier = pgTable('Supplier_Database', {
    supplierId: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
    name: varchar("Name").notNull(),
    type: varchar("Type").notNull(),
    buildingName: varchar("Building").notNull(),
    locationDescription: varchar("Location Description").notNull(),
    floor: integer("Floor").notNull(),
    latitude: numeric("Latitude").notNull(), 
    longitude: numeric("Longitude").notNull(),
    imageURL: varchar("ImageURL").default("NA"),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    //precision 3 keeps updated_at at millisecond precision so the concurrency check can match a JS Date
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).defaultNow(),
    //location is a generated geography column in postgres, queried only in getNearbySuppliersService
},(table) => [
    uniqueIndex('unique_active_supplier_name').on(table.name).where(sql`${table.deletedAt} IS NULL`),
]);

//supplier schema in drizzle-zod to enforce partial updates, 
// accepting non-required fields, and ensure certain fields not updated

/*
drizzle-zod omit() focuses on application layer api safety
*/

export const createSupplierSchema = createInsertSchema(supplier).omit ({
                                    supplierId: true,
                                    createdAt: true, 
                                    updatedAt: true,
                                    deletedAt: true,
                                }).extend
                                ({openingHours: 
                                    z.array(createOpeningHoursSchema).length(7, 'Opening hours must span 7 days of the week')
                                }).refine(
                                    (s) => new Set(s.openingHours.map((h) => h.dayOfWeek)).size == 7, //validate!
                                    {message: 'Opening hours must contain hours for each day of the week exactly once', path: ['openingHours']},
                                );

export const updateSupplierSchema = createUpdateSchema(supplier)
                                    .omit({
                                    supplierId: true,
                                    createdAt: true, 
                                    updatedAt: true,
                                    deletedAt: true,
                                    });

export const updateRequestSchema = updateSupplierSchema.extend({
    expectedUpdatedAt: z.coerce.date(),
});

export const supplierIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
  });

export const supplierCategoryQuerySchema = z.object({
type: SUPPLIER_CATEGORY,
});

/*
Query params arrive as strings, so coerce before the range checks.
radius is in metres to match ST_DWithin on a geography column.
*/
export const supplierRadiusQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().positive(),
});



//return values 
export type SupplierAndDate = typeof supplier.$inferSelect; //this helps with returning all days of the week
export type PublicSupplier = Omit<SupplierAndDate, 'deletedAt'> //standardize supplier return type

export type SupplierWithHours = PublicSupplier &{openingHours: PublicOpeningHours[]}; //full list

export type SearchSupplier = PublicSupplier & {openingHours: PublicOpeningHours | null};

//for CRUD input validation
export type CreateSupplierSchema = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierType = z.infer<typeof updateSupplierSchema>;
export type SupplierCategory = z.infer<typeof SUPPLIER_CATEGORY>;
export type LocationSupplier = z.infer<typeof supplierRadiusQuerySchema>;
