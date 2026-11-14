// AI Assistance Disclosure:
// Tool: Codex (model: GPT-6), date: 2026-11-08
// Scope: Last request service per the precise delivery location spec.
// No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import * as queries from '../db/queries/lastRequest.queries.js';

export async function readLastRequest(userId: string) {
  return (await queries.getLastRequest(userId)) ?? { last_req_del_loc_id: null, last_req_del_loc_details: null };
}

export async function saveLastRequest(userId: string, locationId: number, details: string) {
  await queries.upsertLastRequest(userId, locationId, details);
  return { message: 'Last request saved', code: 'LAST_REQUEST_SAVED' };
}
