import { z } from "zod";

function coordinate(limit: number) {
    return z.number({ error: (issue) => issue.input === undefined ? "is required" : "must be a number" })
        .min(-limit, `must be from -${limit} to ${limit}`)
        .max(limit, `must be from -${limit} to ${limit}`);
}

export const CreateOrderSchema = z.object({
    supplierId: z.string().trim().min(1, "is required"),
    deliveryLocation: z.string().trim().min(2, "must be at least 2 characters"),
    // The drop-off point picked on the map, next to the address typed above.
    deliveryLatitude: coordinate(90),
    deliveryLongitude: coordinate(180),
    neededByTime: z.iso.datetime({
        offset: true,
        error: (issue) => issue.input === undefined ? "is required" : "must be a date and time",
    }),
    itemLines: z.array(z.string().trim().min(1, "cannot be empty"))
        .min(1, "needs at least 1 item")
        .max(10, "can have at most 10 items"),
    creditReward: z.coerce.number({ error: "must be a whole number" })
        .int("must be a whole number")
        .min(1, "must be between 1 and 50")
        .max(50, "must be between 1 and 50"),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// What a participant may ask for. Accepted has its own endpoint and Expired is set by the system.
export const StatusBody = z.object({
    status: z.enum(["PickedUp", "Delivered", "Completed", "Cancelled"], "must be PickedUp, Delivered, Completed or Cancelled"),
});
