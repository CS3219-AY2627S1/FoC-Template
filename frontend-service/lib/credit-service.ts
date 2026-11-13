/**
 * Server-side client for Credit Service reads: the caller's own account, and
 * any account for administrators. Only import this from Server Actions, Route
 * Handlers or Server Components: every route needs the User Service bearer
 * token. Balances only change through order events, so the frontend never
 * writes to Credit Service.
 */

import 'server-only';

import {
  type Page,
  ServiceError,
  createServiceRequest,
  withQuery,
} from '@/lib/service-request';

const BASE_URL = process.env.CREDIT_SERVICE_URL ?? 'http://localhost:8083';

const request = createServiceRequest(BASE_URL, 'Credit Service');

/**
 * Credit a new account receives with the user's first errand. Credit Service
 * reads the same `INITIAL_CREDIT_ALLOCATION` variable, also defaulting to 100.
 */
export const INITIAL_CREDIT_ALLOCATION =
  Number(process.env.INITIAL_CREDIT_ALLOCATION) || 100;

export type CreditBalance = {
  user_id: string;
  available_balance: number;
  /** Held for the caller's open orders until they complete, cancel or expire. */
  reserved_balance: number;
  total_balance: number;
  created_at: string;
  updated_at: string;
};

export type CreditTransactionType =
  | 'INITIAL_ALLOCATION'
  | 'RESERVATION'
  | 'TRANSFER'
  | 'RELEASE'
  | 'ADMIN_ADJUSTMENT';

export type CreditTransaction = {
  id: string;
  order_id: string | null;
  affected_user_id: string;
  counterparty_user_id: string | null;
  actor_user_id: string | null;
  transaction_type: CreditTransactionType;
  outcome: 'SUCCEEDED' | 'REJECTED';
  amount: number;
  available_delta: number;
  reserved_delta: number;
  reason: string;
  correlation_id: string;
  created_at: string;
};

/** A balance, or null when the account doesn't exist yet. */
async function balanceOrNull(path: string, token: string | undefined) {
  try {
    return await request<CreditBalance>(path, { token });
  } catch (error) {
    if (
      error instanceof ServiceError &&
      error.code === 'CREDIT_ACCOUNT_NOT_FOUND'
    ) {
      return null;
    }
    throw error;
  }
}

export const creditService = {
  /**
   * The caller's balance, or null when they have no account yet. Accounts are
   * created with the initial allocation on the user's first order, and reads
   * never create one.
   */
  getMyBalance: (token: string | undefined) =>
    balanceOrNull('/credits/me', token),

  /** The caller's audit trail, newest first. Empty when there is no account. */
  listMyTransactions: (
    token: string | undefined,
    { limit, offset }: { limit?: number; offset?: number } = {},
  ) =>
    request<Page<CreditTransaction>>(
      withQuery('/credits/me/transactions', { limit, offset }),
      { token },
    ),

  /** Another user's balance, or null without an account. Administrators only. */
  getUserBalance: (token: string | undefined, userId: string) =>
    balanceOrNull(`/admin/credits/${encodeURIComponent(userId)}`, token),

  /** Another user's audit trail, newest first. Administrators only. */
  listUserTransactions: (
    token: string | undefined,
    userId: string,
    { limit, offset }: { limit?: number; offset?: number } = {},
  ) =>
    request<Page<CreditTransaction>>(
      withQuery(`/admin/credits/${encodeURIComponent(userId)}/transactions`, {
        limit,
        offset,
      }),
      { token },
    ),
};
