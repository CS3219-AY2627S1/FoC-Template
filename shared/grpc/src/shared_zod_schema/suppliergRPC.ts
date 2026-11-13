// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-25 Asia/Singapore.
// Scope: Imported agreed Supplier validation exports; human review pending.
// Prompt/checks: order-service/usage-log.md (repository root).
import {z} from 'zod';

//Defined to handle errors in gRPC!
export function parseSupplierId(supplierId: string): number | undefined {
  const id = Number(supplierId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return undefined;
  }
  return id;
}

//this is my schema for validating supplier responses
export const grpcsupplierSchema = z.object({
  supplierId: z.string(),
  name: z.string().max(255),
  buildingName: z.string().max(255),
  floor: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
});

export const isOpenResponseSchema = z.object({
  isOpen: z.boolean(), //should get back a boolean
});
