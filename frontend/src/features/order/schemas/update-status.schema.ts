import { z } from "zod";
import { ORDER_STATUSES } from "../types/order.types";

export const updateStatusSchema = z.object({
    newStatus: z.enum(ORDER_STATUSES).optional(),
    failureReason: z.string().trim()
        .max(1500, "Failure reason must be less than 1500 characters"),
    cancellationReason: z.string().trim()
        .max(1500, "Cancellation reason must be less than 1500 characters")
        .optional(),
}).superRefine((value, ctx) => {
    // If the new status is not provided, then it's an error
    if (!value.newStatus) {
        ctx.addIssue({
            code: "custom",
            path: ["newStatus"],
            message: "A new status is required",
        });
    }

    // If the new status is "FAILED", then failure reason is required
    if (value.newStatus === ORDER_STATUSES[6] && !value.failureReason) {
        ctx.addIssue({
            code: "custom",
            path: ["failureReason"],
            message: "Failure reason is required when marking request as failed",
        });
    }
});

export type UpdateStatusFormInput = z.input<typeof updateStatusSchema>;
export type UpdateStatusFormData = z.output<typeof updateStatusSchema>;