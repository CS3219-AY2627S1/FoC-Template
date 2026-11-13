/*
Drizzle-zod schema for creating and updating opening hours 

This is a separate table in the prod db
*/

import { bigint, smallint, time, boolean, timestamp, pgTable, unique } from 'drizzle-orm/pg-core';
import {supplier} from '@data/schema';
import {z} from 'zod';
import {createInsertSchema} from 'drizzle-zod'

export const supplierOpeningHours = pgTable('supplier_opening_hours', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  supplierId: bigint('supplier_id', { mode: 'number' })
    .notNull()
    .references(() => supplier.supplierId, { onDelete: 'restrict' }),
  dayOfWeek: smallint('day_of_week').notNull(),
  opensAt: time('opens_at'),
  closesAt: time('closes_at'),
  isClosed: boolean('is_closed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (t) => [unique().on(t.supplierId, t.dayOfWeek)]); //composite index


/*
smallint only bounds dayOfWeek to 16 bits, so the table's `between 0 and 6` check is
restated here. Without it a body like dayOfWeek 7 satisfies createSupplierSchema's
seven-distinct-days refine() and only fails once it reaches the database.
*/
const dayOfWeekRange = { dayOfWeek: (schema: z.ZodNumber) => schema.min(0).max(6) };

export const createOpeningHoursSchema = createInsertSchema(supplierOpeningHours, dayOfWeekRange).omit({
  supplierId: true
});

/*
createUpdateSchema makes every column optional, which cannot satisfy the table check constraint:
is_closed, opens_at and closes_at have to agree, so an update replaces a whole day rather than one field.
required() keeps opens_at/closes_at nullable but forces the client to state them.
*/
export const updateOpeningHoursSchema = createInsertSchema(supplierOpeningHours, dayOfWeekRange)
                                                          .omit({
                                                          supplierId:true,
                                                          createdAt:true, 
                                                          updatedAt:true
                                                          }).required({
                                                          opensAt:true,
                                                          closesAt:true,
                                                          isClosed:true
                                                          });


/*
The day is addressed by the URL, so it is validated as a path param rather than in the body.
id is restated instead of extending supplierIdParamSchema: schema.ts already imports this file,
and reaching back into it at module scope would evaluate before that import resolves.
*/
export const openingHoursParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
});

//the body carries the hours only; dayOfWeek comes from the path
export const updateOpeningHoursBodySchema = updateOpeningHoursSchema.omit({ dayOfWeek: true });


export type CreateOpeningHours = z.infer<typeof createOpeningHoursSchema>; 
export type UpdateOpeningHours = z.infer<typeof updateOpeningHoursSchema>;

export type OpeningHours = typeof supplierOpeningHours.$inferSelect; //for full gets

export type PublicOpeningHours = Pick<OpeningHours, 'dayOfWeek' | 'opensAt' | 'closesAt' | 'isClosed'>; //only returns these attribute
//especially for the search and filter


                                              
