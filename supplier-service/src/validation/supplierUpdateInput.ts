/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Parses the multipart text fields of PUT /api/v1/admin/suppliers/:id (Phase 3 plan Task 3;
 *        SupplierServiceArchitecture.md §7, §7.3, §8.2). No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { z } from 'zod';
import { fail, invalid, parseCategoryIds, parseJson } from './supplierInput.js';

export interface UpdateSupplierInput {
  version: number;
  name?: string;
  type?: 'Store' | 'Facility';
  /** undefined = untouched, null = cleared. */
  desc?: string | null;
  locationId?: number;
  categoryIds?: number[];
  /** Raw JSON string; resolved against the effective type by the service. */
  openingHours?: string;
  is24h?: boolean;
  isActive?: boolean;
  isPhotoDirty: boolean;
  /** JSON numbers = existing photo ids, JSON strings = placeholders. */
  photoIds?: Array<number | string>;
  placeholderIds?: string[];
}

const bool = (message: string) => z.enum(['true', 'false'], { errorMap: () => ({ message }) });

const fieldsSchema = z.object({
  version: z
    .string({ required_error: 'version is required.' })
    .regex(/^\d+$/, 'version must be a non-negative integer.')
    .transform(Number),
  name: z.string().trim().min(1, 'Supplier name must not be empty.').max(255).optional(),
  type: z.enum(['Store', 'Facility'], { errorMap: () => ({ message: 'Type must be Store or Facility.' }) }).optional(),
  desc: z.string().optional(),
  location_id: z.coerce
    .number({ invalid_type_error: 'Location must be a number.' })
    .int()
    .positive('Location must be a positive id.')
    .optional(),
  openingHours: z.string().optional(),
  is24h: bool('is24h must be true or false.').optional(),
  isActive: bool('isActive must be true or false.').optional(),
  isPhotoDirty: bool('isPhotoDirty must be true or false.').optional(),
});

function parsePhotoIds(raw: unknown): Array<number | string> {
  const result = z
    .array(z.union([z.number().int().positive(), z.string().min(1)]))
    .safeParse(parseJson('photo_ids', String(raw)));
  if (!result.success) fail('photo_ids', 'photo_ids must be a list of photo ids and placeholder ids.');
  return result.data;
}

function parsePlaceholderIds(raw: unknown): string[] {
  const result = z.array(z.string().min(1)).safeParse(parseJson('placeholder_ids', String(raw)));
  if (!result.success) fail('placeholder_ids', 'placeholder_ids must be a list of strings.');
  if (new Set(result.data).size !== result.data.length) fail('placeholder_ids', 'placeholder_ids must be unique.');
  return result.data;
}

export function parseUpdateSupplier(body: Record<string, unknown>): UpdateSupplierInput {
  const fields = fieldsSchema.safeParse(body);
  if (!fields.success) {
    throw invalid(
      fields.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        location: 'body',
        message: issue.message,
      })),
    );
  }
  const data = fields.data;
  const isPhotoDirty = data.isPhotoDirty === 'true';
  if (isPhotoDirty && body.photo_ids === undefined) {
    fail('photo_ids', 'photo_ids is required when isPhotoDirty is true.');
  }

  const input: UpdateSupplierInput = { version: data.version, isPhotoDirty };
  if (data.name !== undefined) input.name = data.name;
  if (data.type !== undefined) input.type = data.type;
  if (data.desc !== undefined) input.desc = data.desc.trim() === '' ? null : data.desc.trim();
  if (data.location_id !== undefined) input.locationId = data.location_id;
  if (body.category_id !== undefined) input.categoryIds = parseCategoryIds(body.category_id);
  if (data.openingHours !== undefined) input.openingHours = data.openingHours;
  if (data.is24h !== undefined) input.is24h = data.is24h === 'true';
  if (data.isActive !== undefined) input.isActive = data.isActive === 'true';
  if (body.photo_ids !== undefined) input.photoIds = parsePhotoIds(body.photo_ids);
  if (body.placeholder_ids !== undefined) input.placeholderIds = parsePlaceholderIds(body.placeholder_ids);

  // Nothing to update (only version, photos not dirty) is rejected (team decision, 2026-09-30).
  if (Object.keys(input).length === 2) fail('body', 'At least one field to update is required.');
  return input;
}
