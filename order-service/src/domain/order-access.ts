/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): GET /orders/:id read rule per George's spec: the requester or
 *        courier sees the full order, anyone else only while it is `open`, and an admin
 *        always. "Admin" means the user-service roles `admin` and `super admin`.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import type { OrderRequest } from '../generated/prisma/client.js';
import { roleOf } from './order-status.js';

/** user-service roles that may read any order (its authorize('admin') minimum). */
const ADMIN_ROLES: ReadonlySet<string> = new Set(['admin', 'super admin']);

export interface Viewer {
  user_id: string;
  role: string;
}

export function canViewOrder(order: OrderRequest, viewer: Viewer): boolean {
  if (ADMIN_ROLES.has(viewer.role)) return true;
  const role = roleOf(order, viewer.user_id);
  if (role === 'requester' || role === 'courier') return true;
  return order.status === 'open';
}
