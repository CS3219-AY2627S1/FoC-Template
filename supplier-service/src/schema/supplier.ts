import { z } from "zod";
import { SupplierType } from "../common.ts";

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

// fields shared by create and update
const supplierFields = {
    name: z.string().trim().min(1, "Name is required").max(100),
    type: z.array(z.enum(SupplierType)).min(1, "Choose at least one type"),
    locationId: z.number().int().positive(),
    // any integer, e.g. basements are negative
    floor: z.number().int().nullable(),
    imageUrl: z.url().nullable(),
    description: z.string().trim().max(500).nullable(),
    opensAt: timeOfDay.nullable(),
    closesAt: timeOfDay.nullable(),
};

export const hoursPairedMessage = "Provide both opensAt and closesAt, or neither";

export const createSupplierSchema = z.object({
    name: supplierFields.name,
    type: supplierFields.type,
    locationId: supplierFields.locationId,
    floor: supplierFields.floor.optional(),
    imageUrl: supplierFields.imageUrl.optional(),
    description: supplierFields.description.optional(),
    opensAt: supplierFields.opensAt.optional(),
    closesAt: supplierFields.closesAt.optional(),
}).strict().refine(
    body => (body.opensAt == null) === (body.closesAt == null),
    { message: hoursPairedMessage, path: ["closesAt"] },
);

// every field optional; hours pairing is checked against the stored supplier in the controller
export const updateSupplierSchema = z.object({
    name: supplierFields.name.optional(),
    type: supplierFields.type.optional(),
    locationId: supplierFields.locationId.optional(),
    floor: supplierFields.floor.optional(),
    imageUrl: supplierFields.imageUrl.optional(),
    description: supplierFields.description.optional(),
    opensAt: supplierFields.opensAt.optional(),
    closesAt: supplierFields.closesAt.optional(),
}).strict().refine(body => Object.keys(body).length > 0, "Nothing to update");

// allows optional searching by name, filtering by location,
// sorting by name, sort order, and pageNumber
// page limit set to 20 is handled in the controller
export const listSuppliersQuerySchema = z.object({
    name: z.string().trim().min(1).optional(),
    locationId: z.coerce.number().int().positive().optional(),

    sortBy: z.enum(["id", "name"]).default("id"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),

    page: z.coerce.number().int().positive().default(1),
}).strict();

export type ListSuppliersQuery =
    z.infer<typeof listSuppliersQuerySchema>;
