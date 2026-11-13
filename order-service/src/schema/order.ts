import { z } from "zod";
import config from "../config.ts";

const locationId = (label: string) => z.number({ error: `${label} is required` }).int().positive();
// whole floors; ground floor is 1, basements are negative (-1 = B1), there is no floor 0
const floor = z.number({ error: "Floor is required" }).int("Must be a whole number")
    .min(-10, "Lowest is B10").max(100, "Highest is level 100")
    .refine(f => f !== 0, "There is no floor 0; ground floor is level 1");
// optional text, blank treated as left out
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
    .transform(v => v || null);

// body of POST /orders; the requester is taken from the access token, not the body.
// Flat rather than nested, so each validation error names the form field it belongs to.
export const createOrderSchema = z.object({
    // SUPPLIER: a registered supplier, whose name and building become the pickup location.
    // BUILDING: any spot in a building, e.g. a friend's room
    pickupType: z.enum(["SUPPLIER", "BUILDING"], { error: "Choose a supplier or a building to pick up from" }),
    supplierId: z.number().int().positive().optional(),
    pickupLocationId: z.number().int().positive().optional(),
    pickupFloor: floor.optional(),
    pickupRoom: optionalText(50),
    // dropoff is always a building
    dropoffLocationId: locationId("Building"),
    dropoffFloor: floor,
    dropoffRoom: optionalText(50),
    itemDescription: z.string().trim().min(1, "Item description is required").max(500),
    creditBounty: z.number().int("Must be a whole number").positive("Must be at least 1"),
    // anything more specific, e.g. a room number at the supplier's building
    additionalDetails: z.string().trim().max(500).nullable().optional(),
    // how long to wait for a courier; left out = the default (24h)
    expiresInMinutes: z.number().int("Must be a whole number of minutes")
        .min(config.order.expiry.minMinutes, `Must be at least ${config.order.expiry.minMinutes} minutes`)
        .max(config.order.expiry.maxMinutes, `Must be at most ${config.order.expiry.maxMinutes / 60} hours`)
        .optional(),
}).strict().superRefine((body, ctx) => {
    // each pickup type needs its own fields, and must not carry the other type's
    const need = (field: keyof typeof body, message: string) => {
        if (body[field] === undefined) ctx.addIssue({ code: "custom", path: [field], message });
    };
    const forbid = (field: keyof typeof body) => {
        if (body[field] !== undefined && body[field] !== null)
            ctx.addIssue({ code: "custom", path: [field], message: `Not allowed for a ${body.pickupType.toLowerCase()} pickup` });
    };
    if (body.pickupType === "SUPPLIER") {
        need("supplierId", "Supplier is required");
        (["pickupLocationId", "pickupFloor", "pickupRoom"] as const).forEach(forbid);
    } else {
        need("pickupLocationId", "Building is required");
        need("pickupFloor", "Floor is required");
        forbid("supplierId");
    }
});

export type CreateOrderBody = z.infer<typeof createOrderSchema>;

const orderStatuses = ["PENDING", "REJECTED", "OPEN", "ACCEPTED", "COLLECTED", "DELIVERED", "CANCELLED", "EXPIRED"] as const;

// query of GET /orders; query strings are always text, so coerce them here
export const listOrdersQuerySchema = z.object({
    // open: errands couriers can accept (not your own); requested: yours; delivering: you are the courier;
    // all: every order (admins only)
    scope: z.enum(["open", "requested", "delivering", "all"]).default("open"),
    // comma separated, e.g. status=DELIVERED,CANCELLED,EXPIRED for past orders
    status: z.string()
        .transform(s => s.split(",").map(t => t.trim()).filter(t => t.length > 0))
        .pipe(z.array(z.enum(orderStatuses)))
        .optional(),
    page: z.coerce.number().int().positive().default(1),
    // admins only: list the "requested" or "delivering" errands of this user instead of their own
    userId: z.coerce.number().int().positive().optional(),
}).strict();

export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// body of PATCH /orders/:id/status; OPEN and EXPIRED are only ever set by the service
export const updateOrderStatusSchema = z.object({
    targetStatus: z.enum(["ACCEPTED", "COLLECTED", "DELIVERED", "CANCELLED"]),
}).strict();

export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusSchema>;
