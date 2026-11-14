/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - request payload shapes for the series API, mirroring
 *        types/orders.ts. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review:
 */

export interface CreateSeriesPayload {
  supplierId: number;
  description: string;
  deliveryLocationId: number; // supplier-service location_id
  deliveryDetails: string;
  credits: number;
  additionalDetails?: string | null;
  rrule: string;
  /** Minutes from the scheduled fire time; omitted defaults to 1440 (24h). */
  durationMinutes?: number;
  startAt?: string; // ISO; startNow wins if both are sent
  startNow?: boolean;
}

export type EditSeriesPayload = Partial<
  Pick<
    CreateSeriesPayload,
    | 'supplierId'
    | 'description'
    | 'deliveryLocationId'
    | 'deliveryDetails'
    | 'credits'
    | 'additionalDetails'
    | 'rrule'
    | 'durationMinutes'
  >
> & { status?: 'active' | 'inactive' };
