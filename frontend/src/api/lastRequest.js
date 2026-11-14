/* AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Last request API calls per the team spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { request } from "./http";

export const getLastRequest = () => request("/users/me/last-request");
export const saveLastRequest = (locationId, details) =>
  request("/users/me/last-request", {
    method: "PUT",
    json: {
      last_req_del_loc_id: Number(locationId),
      last_req_del_loc_details: details,
    },
  });
