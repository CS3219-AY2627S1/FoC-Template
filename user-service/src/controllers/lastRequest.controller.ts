// AI Assistance Disclosure:
// Tool: Codex (model: GPT-6), date: 2026-11-08
// Scope: Last request endpoints per the precise delivery location spec.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { z } from 'zod';
import * as service from '../services/lastRequest.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const body = z.object({
  last_req_del_loc_id: z.number().int().min(1).max(2147483647),
  last_req_del_loc_details: z.string().trim().min(1).max(250),
});

export const read = asyncHandler(async (req, res) => {
  res.status(200).json(await service.readLastRequest(req.user!.user_id));
});
export const update = asyncHandler(async (req, res) => {
  const value = body.parse(req.body);
  res.status(200).json(await service.saveLastRequest(req.user!.user_id, value.last_req_del_loc_id, value.last_req_del_loc_details));
});
