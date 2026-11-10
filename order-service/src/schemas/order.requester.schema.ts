import { z } from "zod";
import { OrderStatus } from "../generated/prisma/client.js";

const orderStatuses = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

export const requesterOrderHistoryQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(15),
    status: z.enum(orderStatuses).optional(),
    sortBy: z.enum(["createdAt", "expiryAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type RequesterOrderHistoryQuery = z.infer<typeof requesterOrderHistoryQuerySchema>;

export const requestFieldsSchema = z.object({
    name: z.string().trim()
        .min(1, "Request name is required")
        .max(255, "Request name must be less than 255 characters"),

    description: z.string().trim()
        .min(1, "Description is required")
        .max(500, "Description must be less than 500 characters"),

    pickupSupplierId: z.uuid("Invalid pickup supplier ID"),

    deliverySupplierId: z.uuid("Invalid delivery supplier ID"),

    offeredCredits: z.number()
        .int("Offered credits must be an integer")
        .positive("Offered credits must be greater than 0"),

    remarks: z.string().trim()
        .max(1500, "Remarks must be less than 1500 characters")
        .optional(),

    expiryAt: z.coerce.date()
        .refine(
            date => !Number.isNaN(date.getTime()),
            "Invalid expiry date",
        )
        .refine(
            date => date > new Date(),
            "Completion deadline must be in the future",
        ),
});

export const createRequestSchema = requestFieldsSchema.refine(
    data => data.pickupSupplierId !== data.deliverySupplierId,
    {
        message: "Pickup and delivery locations must be different",
        path: ["deliverySupplierId"],
    },
);

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = requestFieldsSchema
    .omit({ offeredCredits: true }) // Offered credits cannot be updated after creation
    .partial()
    .extend({
        expectedVersion: z.number().int().positive(),
    })
    .refine(
        (data) =>
            Object.entries(data).some(
                ([key, value]) => key !== "expectedVersion" && value !== undefined,
            ), // Check if at least one field other than expectedVersion is provided
        "At least one field must be provided for update",
    );

export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const receiveRequestSchema = z.object({
    expectedVersion: z.number().int().positive(),
});
export type ReceiveRequestInput = z.infer<typeof receiveRequestSchema>;

export const failRequestSchema = z.object({
    expectedVersion: z.number().int().positive(),
    failureReason: z.string().trim()
        .min(1, "Failure reason is required")
        .max(1500, "Failure reason must be less than 1500 characters")
});
export type FailRequestInput = z.infer<typeof failRequestSchema>;

export const cancelRequestSchema = z.object({
    expectedVersion: z.number().int().positive(),
    cancellationReason: z.string().trim()
        .max(1500, "Cancellation reason must be less than 1500 characters")
        .optional(),
});
export type CancelRequestInput = z.infer<typeof cancelRequestSchema>;

export const renewExpiredRequestSchema = z.strictObject({
    expiryAt: z.coerce.date()
        .refine((date) => date > new Date(), "Completion deadline must be in the future"),
    expectedVersion: z.number().int().positive(),
});
export type RenewExpiredRequestInput = z.infer<typeof renewExpiredRequestSchema>;