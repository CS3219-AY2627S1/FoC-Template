/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): Unit tests for canViewOrder (GET /orders/:id read rule, George's
 *        spec): every status against requester, courier, other user, admin, super admin.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import {
  RequestStatus,
  type OrderRequest,
} from '../generated/prisma/client.js';
import { canViewOrder } from './order-access.js';

const REQUESTER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8d';
const COURIER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8e';
const OTHER = '0192f0c4-7a1e-7c3a-9b2d-3f4e5a6b7c8f';

const order = (status: RequestStatus): OrderRequest =>
  ({
    id: '0192f0c4-0000-7000-8000-000000000001',
    requesterId: REQUESTER,
    courierId: COURIER,
    status,
  }) as OrderRequest;

const ALL = Object.values(RequestStatus);

describe('canViewOrder', () => {
  it.each(ALL)('requester sees a %s order', (status) => {
    expect(
      canViewOrder(order(status), { user_id: REQUESTER, role: 'user' }),
    ).toBe(true);
  });

  it.each(ALL)('courier sees a %s order', (status) => {
    expect(
      canViewOrder(order(status), { user_id: COURIER, role: 'user' }),
    ).toBe(true);
  });

  it.each(ALL)('admin and super admin see a %s order', (status) => {
    for (const role of ['admin', 'super admin']) {
      expect(canViewOrder(order(status), { user_id: OTHER, role })).toBe(true);
    }
  });

  it.each(ALL)('another user sees a %s order only if open', (status) => {
    expect(canViewOrder(order(status), { user_id: OTHER, role: 'user' })).toBe(
      status === 'open',
    );
  });

  it('an open order with no courier yet is not visible as "courier" via a null id', () => {
    const open = { ...order('open'), courierId: null } as OrderRequest;
    const pending = { ...order('pending'), courierId: null } as OrderRequest;
    expect(canViewOrder(open, { user_id: OTHER, role: 'user' })).toBe(true);
    expect(canViewOrder(pending, { user_id: OTHER, role: 'user' })).toBe(false);
  });
});
