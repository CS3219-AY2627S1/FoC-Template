import type { Context } from "@oak/oak";
import { z } from "zod";

/**
 * Error body naming each invalid field, e.g.
 * `{ error, fields: { name: ["Name is required"] } }` (FR 5.5.4).
 * Problems not tied to one field (unknown keys, empty patch) go in `errors`
 */
const describeError = (error: string, err: z.ZodError) => {
    const { formErrors, fieldErrors } = z.flattenError(err);
    return {
        error,
        fields: fieldErrors,
        ...(formErrors.length > 0 ? { errors: formErrors } : {}),
    };
};

export const validateQuery = (schema: z.ZodType) =>
    async (ctx: Context, next: () => Promise<unknown>) => {
        const raw = Object.fromEntries(ctx.request.url.searchParams);
        const result = schema.safeParse(raw);
        if (!result.success) {
            ctx.response.status = 400;
            ctx.response.body = describeError("invalid query parameters", result.error);
            return;
        }
        ctx.state.validatedQuery = result.data;
        await next();
    };

export const validateBody = (schema: z.ZodType) =>
    async (ctx: Context, next: () => Promise<unknown>) => {
        let raw: unknown;
        try {
            raw = await ctx.request.body.json();
        } catch {
            ctx.response.status = 400;
            ctx.response.body = { error: "request expected json body" };
            return;
        }
        const result = schema.safeParse(raw);
        if (!result.success) {
            ctx.response.status = 400;
            ctx.response.body = describeError("invalid request body", result.error);
            return;
        }
        ctx.state.validatedBody = result.data;
        await next();
    };
