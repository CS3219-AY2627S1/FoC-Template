import { z } from "zod";

export const createLocationSchema = z.object({
    name: z.string().trim().min(1),
});