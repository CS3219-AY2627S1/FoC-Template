/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the lookup controller per Phase 2 plan Task 4. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { LookupService } from '../business/lookupService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { categoryBody, facultyBody, locationCreateBody, locationUpdateBody } from '../validation/lookupInput.js';
import { idParamSchema, parseOrThrow } from '../validation/supplierQuery.js';

export function createLookupController(service: LookupService) {
  const id = (params: unknown) => parseOrThrow(idParamSchema, params, 'path').id;

  return {
    createFaculty: asyncHandler(async (req, res) => {
      const body = parseOrThrow(facultyBody, req.body, 'body');
      res.status(201).json(await service.createFaculty(body.faculty));
    }),
    updateFaculty: asyncHandler(async (req, res) => {
      const body = parseOrThrow(facultyBody, req.body, 'body');
      res.status(200).json(await service.updateFaculty(id(req.params), body.faculty));
    }),
    deleteFaculty: asyncHandler(async (req, res) => {
      res.status(200).json(await service.deleteFaculty(id(req.params)));
    }),

    createLocation: asyncHandler(async (req, res) => {
      const body = parseOrThrow(locationCreateBody, req.body, 'body');
      res.status(201).json(
        await service.createLocation({ location: body.location, facultyId: body.faculty_id, level: body.level }),
      );
    }),
    updateLocation: asyncHandler(async (req, res) => {
      const body = parseOrThrow(locationUpdateBody, req.body, 'body');
      res.status(200).json(
        await service.updateLocation(id(req.params), {
          location: body.location,
          facultyId: body.faculty_id,
          level: body.level,
        }),
      );
    }),
    deleteLocation: asyncHandler(async (req, res) => {
      res.status(200).json(await service.deleteLocation(id(req.params)));
    }),

    createCategory: asyncHandler(async (req, res) => {
      const body = parseOrThrow(categoryBody, req.body, 'body');
      res.status(201).json(await service.createCategory(body.category_type));
    }),
    updateCategory: asyncHandler(async (req, res) => {
      const body = parseOrThrow(categoryBody, req.body, 'body');
      res.status(200).json(await service.updateCategory(id(req.params), body.category_type));
    }),
    deleteCategory: asyncHandler(async (req, res) => {
      res.status(200).json(await service.deleteCategory(id(req.params)));
    }),
  };
}
