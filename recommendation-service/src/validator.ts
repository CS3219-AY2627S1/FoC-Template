import { z } from "zod";
import type { ValidationResult } from "./types.ts";

const RequestSchema = z.object({
    supplierId: z.string().trim().min(1, "Choose a pickup location"),
    location: z.string().trim().min(2, "Enter a drop-off location"),
    neededBy: z.string()
        .datetime({ message: "Enter a valid needed-by time" })
        .refine((ts) => new Date(ts) > new Date(), "The needed-by time must be in the future"),
    items: z.array(z.string().trim().min(1, "Items cannot be blank"))
        .min(1, "Add at least one item")
        .max(10, "Add no more than 10 items"),
    distance: z.number().nonnegative("Distance cannot be negative").optional(),
});

export function validateRecommendationRequest(input: unknown): ValidationResult {
    const parsed = RequestSchema.safeParse(input);
    if (parsed.success) {
        return { ok: true, data: parsed.data };
    }
    // Messages are self-describing, so the field path would only repeat them.
    const errors = parsed.error.issues.map((issue) => issue.message);
    return { ok: false, errors };
}
