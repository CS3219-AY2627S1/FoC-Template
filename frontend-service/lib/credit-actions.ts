'use server';

import {
  type ActionResult,
  type PageResult,
  toResult,
} from '@/lib/action-result';
import {
  type CreditBalance,
  type CreditTransaction,
  creditService,
} from '@/lib/credit-service';
import { FIRST_PAGE, type PageWindow, clampPageWindow } from '@/lib/paging';
import { getSessionToken } from '@/lib/session';

/** `balance` is null until the user's first order opens an account. */
export type CreditBalanceResult = ActionResult<{
  balance: CreditBalance | null;
}>;

export async function loadBalance(): Promise<CreditBalanceResult> {
  return toResult(async () => ({
    balance: await creditService.getMyBalance(await getSessionToken()),
  }));
}

export async function loadTransactions(
  window: PageWindow = FIRST_PAGE,
): Promise<PageResult<CreditTransaction>> {
  return toResult(async () => {
    const page = await creditService.listMyTransactions(
      await getSessionToken(),
      clampPageWindow(window),
    );
    return { items: page.items, total: page.total, loadedAt: Date.now() };
  });
}
