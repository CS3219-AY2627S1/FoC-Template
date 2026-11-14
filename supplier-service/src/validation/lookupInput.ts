/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented zod schemas for the lookup request bodies per Phase 2 plan Task 4. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

export const facultyBody = z.object({ faculty: z.string().trim().min(1).max(255) });

export const locationCreateBody = z.object({
  location: z.string().trim().min(1).max(255),
  faculty_id: positiveInt,
  level: z.coerce.number().int(),
});

export const locationUpdateBody = locationCreateBody
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

export const categoryBody = z.object({ category_type: z.string().trim().min(1).max(100) });
