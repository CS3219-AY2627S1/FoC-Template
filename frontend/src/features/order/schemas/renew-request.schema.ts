import { z } from "zod";

export const renewRequestSchema = z.object({
    expiryAt: z
        .string()
        .min(1, "Completion deadline is required")
        .refine(
            (value) => new Date(value) > new Date(),
            "Completion deadline must be in the future"
        )
        .transform((value) => new Date(value).toISOString()),
    expectedVersion: z.number().int().positive(),
});

export type RenewRequestFormInput = z.input<typeof renewRequestSchema>;
export type RenewRequestFormData = z.output<typeof renewRequestSchema>;
