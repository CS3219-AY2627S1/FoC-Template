/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Errand record type, row mapping, supplier snapshot and actor types, implementing the
 *        approved plan.
 * Author review: Reviewed and approved by @mattis.
 */
import type { ErrandState } from "../domain/states";

export interface ErrandItem {
  name: string;
  quantity: number;
}

/** One `errands` row, camelCased. */
export interface Errand {
  id: string;
  requesterId: string;
  courierId: string | null;
  supplierId: string;
  supplierName: string;
  supplierBuildingCode: string;
  supplierLocationDescription: string;
  items: ErrandItem[];
  dropoffLocation: string;
  notes: string | null;
  creditAmount: number;
  state: ErrandState;
  reservationOperationId: string;
  rejectionReason: string | null;
  reservationDeadline: Date;
  listingDeadline: Date;
  pickupDeadline: Date;
  deliveryDeadline: Date;
  confirmDeadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  closedAt: Date | null;
}

/** The supplier's details, copied onto the errand when it is created. */
export interface SupplierSnapshot {
  id: string;
  name: string;
  buildingCode: string;
  locationDescription: string;
}

export type Actor =
  | { kind: "user"; id: string; role: "MEMBER" | "ADMINISTRATOR" }
  | { kind: "system" }
  | { kind: "credit" };

// pg returns TIMESTAMPTZ as Date and JSONB already parsed
export function mapErrandRow(row: Record<string, any>): Errand {
  return {
    id: row.id,
    requesterId: row.requester_id,
    courierId: row.courier_id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierBuildingCode: row.supplier_building_code,
    supplierLocationDescription: row.supplier_location_description,
    items: row.items,
    dropoffLocation: row.dropoff_location,
    notes: row.notes,
    creditAmount: row.credit_amount,
    state: row.state,
    reservationOperationId: row.reservation_operation_id,
    rejectionReason: row.rejection_reason,
    reservationDeadline: row.reservation_deadline,
    listingDeadline: row.listing_deadline,
    pickupDeadline: row.pickup_deadline,
    deliveryDeadline: row.delivery_deadline,
    confirmDeadline: row.confirm_deadline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    pickedUpAt: row.picked_up_at,
    deliveredAt: row.delivered_at,
    closedAt: row.closed_at,
  };
}
