/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Generated create-request parsing and hours rules per the plan (Phase 2 Task 5).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): exported the shared validation helpers and added
 *        resolveHours, reused by parseCreateSupplier (Phase 3 Task 2). No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { z } from 'zod';
import { AppError, type AppErrorDetail } from '../utils/AppError.js';

const ALWAYS_OPEN_DAY = 8;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface HourInput {
  day: number; // 1 = Monday .. 7 = Sunday; 8 = open 24/7 (Arch §6.2)
  open: string;
  close: string;
  is24h: boolean; // true only on the day-8 entry
}

export interface CreateSupplierInput {
  name: string;
  type: 'Store' | 'Facility';
  desc: string | null;
  locationId: number;
  categoryIds: number[];
  hours: HourInput[];
}

const ALWAYS_OPEN: HourInput = { day: ALWAYS_OPEN_DAY, open: '00:00', close: '23:59', is24h: true };

const fieldsSchema = z.object({
  name: z.string({ required_error: 'Supplier name is required.' }).trim().min(1, 'Supplier name is required.').max(255),
  type: z.enum(['Store', 'Facility'], {
    errorMap: () => ({ message: 'Type must be Store or Facility.' }),
  }),
  desc: z.string().optional(),
  location_id: z.coerce
    .number({ invalid_type_error: 'Location is required.' })
    .int()
    .positive('Location is required.'),
  is24h: z.enum(['true', 'false']).optional(),
});

const hourSchema = z.object({
  day: z.number().int().min(1).max(8),
  open: z.string().regex(TIME, 'Time must be HH:MM.'),
  close: z.string().regex(TIME, 'Time must be HH:MM.'),
});

const idListSchema = z.array(z.number().int().positive());

export function invalid(
  details: AppErrorDetail[],
  message = 'One or more supplier fields failed validation.',
): AppError {
  return new AppError(422, 'Unprocessable Entity', message, { details });
}

export function fail(field: string, message: string): never {
  throw invalid([{ field, location: 'body', message }], message);
}

export function parseJson(field: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(400, 'Bad Request', `${field} must be valid JSON.`, {
      details: [{ field, location: 'body', message: `${field} must be valid JSON.` }],
    });
  }
}

export function parseCategoryIds(raw: unknown): number[] {
  if (raw === undefined || raw === '') return [];
  const parsed = parseJson('category_id', String(raw));
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const result = idListSchema.safeParse(list);
  if (!result.success) fail('category_id', 'category_id must be a list of category ids.');
  return [...new Set(result.data)];
}

function parseStoreHours(raw: unknown, is24h: boolean): HourInput[] {
  const parsed = raw === undefined || raw === '' ? [] : parseJson('openingHours', String(raw));
  const list = z.array(hourSchema).safeParse(parsed);
  if (!list.success) {
    throw invalid(
      list.error.issues.map((issue) => ({
        field: 'openingHours',
        location: 'body',
        message: issue.message,
      })),
    );
  }
  const entries = list.data;

  if (is24h) {
    const [only] = entries;
    const valid =
      entries.length === 1 &&
      only !== undefined &&
      only.day === ALWAYS_OPEN_DAY &&
      only.open === ALWAYS_OPEN.open &&
      only.close === ALWAYS_OPEN.close;
    if (!valid) {
      fail('openingHours', 'A 24/7 Store must send a single entry {"day": 8, "open": "00:00", "close": "23:59"}.');
    }
    return [{ ...ALWAYS_OPEN }];
  }

  if (entries.length === 0) {
    fail('openingHours', 'Operating hours are required for a Store.');
  }

  const seen = new Set<number>();
  for (const entry of entries) {
    if (entry.day === ALWAYS_OPEN_DAY) {
      fail('openingHours', 'Day 8 is reserved for 24/7 suppliers; set is24h instead.');
    }
    if (entry.open === entry.close) {
      fail('openingHours', 'A 24-hour schedule must be entered as 00:00–23:59.');
    }
    if (seen.has(entry.day)) {
      fail('openingHours', 'Each day may appear only once.');
    }
    seen.add(entry.day);
  }
  return entries.map((entry) => ({ ...entry, is24h: false }));
}

/** Hours for a supplier of the given type (Arch §6.2, §7): Facility → server-filled day 8; Store → client hours. */
export function resolveHours(type: 'Store' | 'Facility', rawOpeningHours: unknown, is24h: boolean): HourInput[] {
  return type === 'Facility' ? [{ ...ALWAYS_OPEN }] : parseStoreHours(rawOpeningHours, is24h);
}

/** Parses the multipart text fields of POST /api/v1/admin/suppliers (Arch §7.3, §7.4). */
export function parseCreateSupplier(body: Record<string, unknown>): CreateSupplierInput {
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
  const categoryIds = parseCategoryIds(body.category_id);

  // A Facility is always 24/7: the server fills in the single day-8 entry (Arch §7, §9 item 21 (g)).
  const hours = resolveHours(data.type, body.openingHours, data.is24h === 'true');

  return {
    name: data.name,
    type: data.type,
    desc: data.desc === undefined || data.desc.trim() === '' ? null : data.desc.trim(),
    locationId: data.location_id,
    categoryIds,
    hours,
  };
}
