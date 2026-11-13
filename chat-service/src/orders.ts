// AI-assisted (Claude), reviewed and tested by Maliha
// Who is on an errand, and is it still going? Asked from order-service.
//
// order-service has no GET /orders/:id (and gRPC GetOrder is still a stub),
// so we ask for the user's own orders with their token. That also means
// order-service does the "is this your order" check, not us.
import { env } from './env';

export type Order = {
  id: string;
  requesterId: string;
  courierId: string | null;
  requesterName: string;
  courierName: string | null;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';
  deliveredAt: string | null;
  cancelledAt: string | null;
};

export type Scope = 'requested' | 'assigned';

export class OrderServiceDown extends Error {}

async function listMine(scope: Scope, token: string): Promise<Order[]> {
  let res: Response;
  try {
    res = await fetch(`${env.ORDER_SERVICE_URL}/orders?scope=${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new OrderServiceDown('order-service unreachable');
  }
  if (!res.ok) throw new OrderServiceDown(`order-service answered ${res.status}`);
  const body = (await res.json()) as { orders: Order[] };
  return body.orders;
}

// Pass the scope that matched last time to skip the second request.
// null = this order isn't one of the user's.
export async function findMyOrder(orderId: string, token: string, hint?: Scope) {
  const scopes: Scope[] = hint ? [hint] : ['requested', 'assigned'];
  for (const scope of scopes) {
    const order = (await listMine(scope, token)).find((o) => o.id === orderId);
    if (order) return { order, scope };
  }
  return null;
}