'use server';

import { revalidatePath } from 'next/cache';

import {
  type ActionResult,
  type FailureOverrides,
  type PageResult,
  toResult,
} from '@/lib/action-result';
import {
  type DeliveryLocation,
  type Order,
  type OrderCreate,
  type OrderRole,
  type OrderStatus,
  orderService,
} from '@/lib/order-service';
import { withSuppliers } from '@/lib/order-views';
import { DUPLICATE_SUBMISSION, type OrderView } from '@/lib/orders';
import { FIRST_PAGE, type PageWindow, clampPageWindow } from '@/lib/paging';
import type { Page } from '@/lib/service-request';
import { getSessionToken } from '@/lib/session';

export type OrderActionResult = ActionResult<{ order: OrderView }>;

async function act(
  run: (token: string | undefined) => Promise<Order>,
  overrides?: FailureOverrides,
): Promise<OrderActionResult> {
  return toResult(async () => {
    const [order] = await withSuppliers([await run(await getSessionToken())]);
    return { order };
  }, overrides);
}

async function loadPage(
  read: (token: string | undefined, window: PageWindow) => Promise<Page<Order>>,
  window: PageWindow,
): Promise<PageResult<OrderView>> {
  return toResult(async () => {
    const page = await read(await getSessionToken(), clampPageWindow(window));
    return {
      items: await withSuppliers(page.items),
      total: page.total,
      loadedAt: Date.now(),
    };
  });
}

/**
 * The browser keeps one idempotency key per form submission, so a retry after
 * a timeout returns the original order instead of posting a second one.
 */
export async function createOrder(
  idempotencyKey: string,
  order: OrderCreate,
): Promise<OrderActionResult> {
  return act(
    (token) => orderService.createOrder(token, idempotencyKey, order),
    {
      // The key was used before with different details.
      409: {
        message:
          'An earlier attempt was already posted. Check My Errands before posting again.',
        code: DUPLICATE_SUBMISSION,
      },
    },
  );
}

export async function loadOrder(id: string): Promise<OrderActionResult> {
  return act((token) => orderService.getOrder(token, id));
}

/**
 * Polls a new order. Once Credit Service has decided (`OPEN` or `REJECTED`),
 * the layout is revalidated in this same action response, so the side nav
 * picks up the new balance, including an account opened by this first
 * order, even when the reservation itself was rejected.
 */
export async function pollNewOrder(id: string): Promise<OrderActionResult> {
  const result = await loadOrder(id);
  if (result.ok && result.order.status !== 'PENDING_CREDIT') {
    revalidatePath('/', 'layout');
  }
  return result;
}

export async function loadOpenOrders(
  window: PageWindow = FIRST_PAGE,
): Promise<PageResult<OrderView>> {
  return loadPage(orderService.listOpenOrders, window);
}

export async function loadMyOrders(
  role: OrderRole,
  status: OrderStatus | undefined,
  window: PageWindow = FIRST_PAGE,
): Promise<PageResult<OrderView>> {
  return loadPage(
    (token, page) => orderService.listMyOrders(token, role, status, page),
    window,
  );
}

export async function acceptOrder(id: string) {
  return act((token) => orderService.acceptOrder(token, id), {
    409: { message: 'Another courier accepted this errand first.' },
    // Order Service hides orders that left OPEN from non-participants.
    404: { message: 'This errand is no longer available.' },
  });
}

export async function pickUpOrder(id: string) {
  return act((token) => orderService.pickUpOrder(token, id));
}

// Completing or cancelling moves credit, but Credit Service applies it from
// Kafka after this returns. The client polls the balance instead (see
// `CreditBalanceProvider`), so the layout is not revalidated here.
export async function completeOrder(id: string) {
  return act((token) => orderService.completeOrder(token, id));
}

export async function cancelOrder(id: string) {
  return act((token) => orderService.cancelOrder(token, id));
}

export async function changeDelivery(id: string, delivery: DeliveryLocation) {
  return act((token) => orderService.changeDelivery(token, id, delivery));
}
