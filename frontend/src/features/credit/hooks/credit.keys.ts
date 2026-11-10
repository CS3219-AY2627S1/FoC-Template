import type { CreditTransactionParams } from "../types/credit.types";

export const creditKeys = {
    all: ["credits"] as const,
    balance: (userId: string) => [...creditKeys.all, userId, "balance"] as const,
    transactions: (userId: string) => [...creditKeys.all, userId, "transactions"] as const,
    transactionPage: (userId: string, params: CreditTransactionParams) =>
        [...creditKeys.transactions(userId), params] as const,
};
