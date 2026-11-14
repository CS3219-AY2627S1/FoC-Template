/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Validation for the list query parameters and :id path parameter listed in
 *        SupplierServiceArchitecture.md §7.2, mapping failures to the 422 error envelope from §7.1 /
 *        §7.1.1. The open questions on `limit`, defaults and edges are recorded in the Phase 1 plan.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-29, Claude Code, model: claude-sonnet-5): allowed 'body' as a parseOrThrow location per Phase 2 plan
 *        Task 4. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-05, Claude Code, model: claude-sonnet-5-5): Added the ids list parameter to the list query schema, per the 2026-11-05
 *        supplier-bookmarking spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';

export const PAGE_SIZE = 50;

const positiveInt = z.coerce.number().int().positive();

const MAX_IDS = 20;
const MAX_ID = 2147483647;

// "3,x,7" -> { valid: [3, 7], invalid: ['x'] }. Empty items are ignored and duplicates dropped. An
// item that is not a positive whole number is reported back as invalid instead of failing the
// request, so one bad value never blocks the good ones. More than MAX_IDS items is a 422.
const idsField = z
  .string()
  .transform((raw) => raw.split(',').filter((part) => part !== ''))
  .pipe(z.array(z.string()).max(MAX_IDS, `ids accepts at most ${MAX_IDS} values`))
  .transform((parts) => {
    const valid: number[] = [];
    const invalid: string[] = [];
    for (const part of new Set(parts)) {
      if (/^[1-9]\d*$/.test(part) && Number(part) <= MAX_ID) valid.push(Number(part));
      else invalid.push(part);
    }
    return { valid, invalid };
  });

export const listQuerySchema = z.object({
  page: positiveInt.default(1),
  limit: z.coerce
    .number()
    .int()
    .refine((value) => value === PAGE_SIZE, { message: `limit is fixed at ${PAGE_SIZE}` })
    .optional(),
  search: z.string().trim().optional(),
  location_id: positiveInt.optional(),
  category_id: positiveInt.optional(),
  isOpen: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sortOrder: z.enum(['A-Z', 'Z-A']).default('A-Z'),
  ids: idsField.optional(),
});

export const idParamSchema = z.object({ id: positiveInt });

export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  location: 'query' | 'path' | 'body',
): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  throw new AppError(422, 'Unprocessable Entity', 'One or more request values failed validation.', {
    details: result.error.issues.map((issue) => ({
      field: issue.path.join('.') || location,
      location,
      message: issue.message,
    })),
  });
}
