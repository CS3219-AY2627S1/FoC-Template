/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented precise delivery details per the team spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope (2026-10-20): Issue #11 - deliveryLocation (text) became deliveryLocationId
 *        (supplier-service location id, George 2026-10-20).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

export interface CreateOrderPayload {
  supplierId: number;
  description: string;
  deliveryLocationId: number; // supplier-service location_id
  deliveryDetails: string;
  credits: number;
  completeBy?: string | null;
  additionalDetails?: string | null;
}

export type EditOrderPayload = Partial<CreateOrderPayload>;
