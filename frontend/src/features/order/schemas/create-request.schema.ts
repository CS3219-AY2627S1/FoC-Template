import { z } from "zod";

export const createRequestSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Request name is required")
        .max(255, "Request name must be less than 255 characters"),

    description: z
        .string()
        .trim()
        .min(1, "Description is required")
        .max(500, "Description must be less than 500 characters"),

    pickupSupplierId: z
        .uuid("Please select a pickup location"),

    deliverySupplierId: z
        .uuid("Please select a delivery location"),

    offeredCredits: z
        .string()
        .min(1, "Offered credits is required")
        .transform(Number)
        .pipe(
            z.number()
                .int("Credits must be a whole number")
                .positive("Credits must be greater than 0")
        ),
    expiryAt: z
        .string()
        .min(1, "Completion deadline is required")
        .refine(
            (value) => new Date(value) > new Date(),
            "Completion deadline must be in the future"
        )
        .transform((value) => new Date(value).toISOString()),

    remarks: z
        .string()
        .trim()
        .max(1500, "Remarks are too long")
}).refine(
    data => data.pickupSupplierId !== data.deliverySupplierId,
    {
        message: "Pickup and delivery locations must be different",
        path: ["deliverySupplierId"],
    },
);

export type CreateRequestFormInput = z.input<typeof createRequestSchema>;
export type CreateRequestFormData = z.output<typeof createRequestSchema>;