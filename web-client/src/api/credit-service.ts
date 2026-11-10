// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13, 2026-10-28, 2026-10-29
// Scope: Implemented the wallet client; added admin settlement, analytics and wallet lookup
// calls.
// Author review: I validated correctness and supplied additional boundary checks.

import { requestJson } from "./client";

export type Wallet = { userId: string; available: number; reserved: number; total: number; updatedAt: string };
export type CreditTransactionType = "ALLOCATION" | "RESERVATION" | "RELEASE" | "TRANSFER";
export type CreditTransaction = {
  transactionId: string;
  type: CreditTransactionType;
  amount: number;
  walletUserId: string;
  counterpartyUserId: string | null;
  orderId: string | null;
  createdAt: string;
};
export type CreditPage<T> = { items: T[]; page: number; pageSize: number; total: number };
export type CreditPageQuery = { page: number; pageSize: number };

export type Settlement = { orderId: string; state: "RESERVED" | "RELEASED" | "TRANSFERRED" | "CLOSED"; amount: number; updatedAt: string };
export type CreditAnalytics = {
  from: string;
  to: string;
  timeZone: "Asia/Singapore";
  generatedAt: string;
  circulation: { available: number; reserved: number; total: number };
  transfers: { count: number; amount: number };
};

// Read-only administrator views (N2F3.4.2, N2F4.5); they never change balances.
export const adminCreditService = {
  settlement: (orderId: string, token: string) =>
    requestJson<Settlement>(`/admin/credit/reservations/${encodeURIComponent(orderId)}`, { method: "GET" }, token),
  analytics: (from: string, to: string, token: string) =>
    requestJson<CreditAnalytics>(`/admin/credit/analytics?${new URLSearchParams({ from, to })}`, { method: "GET" }, token),
  wallet: (userId: string, token: string) =>
    requestJson<Wallet>(`/admin/wallets/${encodeURIComponent(userId)}`, { method: "GET" }, token),
  transactions: (userId: string, query: CreditPageQuery, token: string) => {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
    return requestJson<CreditPage<CreditTransaction>>(`/admin/wallets/${encodeURIComponent(userId)}/transactions?${params}`, { method: "GET" }, token);
  },
};

export const creditService = {
  myWallet: (token: string) => requestJson<Wallet>("/wallets/me", { method: "GET" }, token),
  myTransactions: (query: CreditPageQuery, token: string) => {
    const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
    return requestJson<CreditPage<CreditTransaction>>(`/wallets/me/transactions?${params}`, { method: "GET" }, token);
  },
};
