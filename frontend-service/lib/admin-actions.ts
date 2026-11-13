'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  type ActionResult,
  type PageResult,
  toResult,
} from '@/lib/action-result';
import { orderFilterStatuses, parseOrderFilter } from '@/lib/admin-orders';
import { isUuid, parseUserFilters } from '@/lib/admin-users';
import type { CreditBalanceResult } from '@/lib/credit-actions';
import { type CreditTransaction, creditService } from '@/lib/credit-service';
import type { OrderActionResult } from '@/lib/order-actions';
import { type OrderActivity, orderService } from '@/lib/order-service';
import { withSuppliers } from '@/lib/order-views';
import type { OrderView } from '@/lib/orders';
import { FIRST_PAGE, type PageWindow, clampPageWindow } from '@/lib/paging';
import {
  getSessionToken,
  requireCurrentUser,
  setAdminViewCookie,
} from '@/lib/session';
import { type User, userService } from '@/lib/user-service';

/**
 * Every action here is a public endpoint. User Service and Credit Service
 * check the caller's admin role on each request, so these only shape input.
 */
async function requireToken() {
  const token = await getSessionToken();
  if (!token) redirect('/');
  return token;
}

const NOT_FOUND = { message: 'This account no longer exists.' };

/**
 * Switches between the admin and user views and returns that view's home for
 * the client to open. It doesn't `redirect()` itself: Next rejects the
 * action's promise with a redirect error, which reads as a failure.
 */
export async function switchView(
  view: 'admin' | 'user',
): Promise<{ href: string }> {
  const user = await requireCurrentUser();
  const toAdmin = view === 'admin' && user.role === 'admin';
  await setAdminViewCookie(toAdmin);
  revalidatePath('/', 'layout');
  return { href: toAdmin ? '/admin/users' : '/home' };
}

export async function loadUsers(
  filters: { q?: string; status?: string },
  window: PageWindow = FIRST_PAGE,
): Promise<PageResult<User>> {
  const token = await requireToken();
  return toResult(async () => {
    const page = await userService.listUsers(token, {
      ...parseUserFilters(filters),
      ...clampPageWindow(window),
    });
    return { items: page.items, total: page.total, loadedAt: Date.now() };
  });
}

export async function loadUser(
  userId: string,
): Promise<ActionResult<{ user: User }>> {
  const token = await requireToken();
  if (!isUuid(userId)) {
    return { ok: false, status: 404, message: NOT_FOUND.message };
  }
  return toResult(
    async () => ({ user: await userService.getUser(token, userId) }),
    {
      404: NOT_FOUND,
    },
  );
}

/** `balance` is null until the user's first order opens an account. */
export async function loadUserBalance(
  userId: string,
): Promise<CreditBalanceResult> {
  const token = await requireToken();
  if (!isUuid(userId)) {
    return { ok: false, status: 404, message: NOT_FOUND.message };
  }
  return toResult(async () => ({
    balance: await creditService.getUserBalance(token, userId),
  }));
}

export async function loadUserTransactions(
  userId: string,
  window: PageWindow = FIRST_PAGE,
): Promise<PageResult<CreditTransaction>> {
  const token = await requireToken();
  if (!isUuid(userId)) {
    return { ok: false, status: 404, message: NOT_FOUND.message };
  }
  return toResult(async () => {
    const page = await creditService.listUserTransactions(
      token,
      userId,
      clampPageWindow(window),
    );
    return { items: page.items, total: page.total, loadedAt: Date.now() };
  });
}

type ModerationResult = ActionResult<{ user: User }>;

async function moderate(
  userId: string,
  change: (token: string, userId: string) => Promise<User>,
): Promise<ModerationResult> {
  const token = await requireToken();
  if (!isUuid(userId)) {
    return { ok: false, status: 404, message: NOT_FOUND.message };
  }
  const result = await toResult(
    async () => ({ user: await change(token, userId) }),
    {
      404: NOT_FOUND,
    },
  );
  if (result.ok) revalidatePath('/admin', 'layout');
  return result;
}

/** Blocks the account and logs it out everywhere. */
export async function suspendAccount(userId: string) {
  return moderate(userId, userService.suspendUser);
}

/** Restores a suspended account to active. */
export async function reinstateAccount(userId: string) {
  return moderate(userId, userService.unsuspendUser);
}

/** Makes another active, non-admin user an administrator. */
export async function promoteToAdmin(userId: string) {
  return moderate(userId, userService.grantAdmin);
}

const ORDER_NOT_FOUND = { message: 'This order does not exist.' };

/** Any order, with its pickup store. Order Service lets admins read them all. */
export async function loadOrderAsAdmin(
  orderId: string,
): Promise<OrderActionResult> {
  const token = await requireToken();
  if (!isUuid(orderId)) {
    return { ok: false, status: 404, message: ORDER_NOT_FOUND.message };
  }
  return toResult(
    async () => {
      const [order] = await withSuppliers([
        await orderService.getOrder(token, orderId),
      ]);
      return { order };
    },
    { 404: ORDER_NOT_FOUND },
  );
}

/**
 * Cancels any order that hasn't closed, including one already picked up.
 * Order Service checks the caller is an active admin on this request; a
 * picked-up cancellation makes Credit Service pay the courier.
 */
export async function cancelOrderAsAdmin(
  orderId: string,
): Promise<OrderActionResult> {
  const token = await requireToken();
  if (!isUuid(orderId)) {
    return { ok: false, status: 404, message: ORDER_NOT_FOUND.message };
  }
  const result = await toResult(
    async () => {
      const [order] = await withSuppliers([
        await orderService.cancelOrder(token, orderId),
      ]);
      return { order };
    },
    {
      403: { message: 'Only an active administrator can cancel this order.' },
      404: ORDER_NOT_FOUND,
      409: {
        message:
          'This order has already closed. Reload to see its latest status.',
      },
    },
  );
  if (result.ok) revalidatePath('/admin', 'layout');
  return result;
}

/** Every order matching one of the list's tabs, newest first. */
export async function loadAllOrders(
  filter: string,
  window: PageWindow = FIRST_PAGE,
): Promise<PageResult<OrderView>> {
  const token = await requireToken();
  return toResult(async () => {
    const page = await orderService.listAllOrders(
      token,
      orderFilterStatuses(parseOrderFilter(filter)),
      clampPageWindow(window),
    );
    return {
      items: await withSuppliers(page.items),
      total: page.total,
      loadedAt: Date.now(),
    };
  });
}

/** Hourly creations, acceptances and completions over the past day. */
export async function loadOrderActivity(): Promise<
  ActionResult<{ activity: OrderActivity }>
> {
  const token = await requireToken();
  return toResult(async () => ({
    activity: await orderService.getOrderActivity(token, 24),
  }));
}
