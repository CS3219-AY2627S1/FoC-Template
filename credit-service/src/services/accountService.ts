import { findAccountByUserId, insertAccount } from "../models/database/credit-service/accountsCollection.ts";
import { insertTransaction } from "../models/database/credit-service/transactionsCollection.ts";

const INITIAL_CREDITS = 50;

export async function createAccount(userId: string): Promise<void> {
    const existing = await findAccountByUserId(userId);
    if (existing) return;

    try {
        await insertAccount({ userId, available: INITIAL_CREDITS, reserved: 0 });
    } catch (err) {
        if ((err as { code?: number }).code === 11000) return; // a concurrent announcement won the race; the unique userId index keeps it idempotent
        throw err;
    }
    await insertTransaction({ userId, type: 'allocation', amount: INITIAL_CREDITS, createdAt: new Date() });
}

export async function getBalance(userId: string) {
    const account = await findAccountByUserId(userId);
    if (!account) throw new Error('Account not found');
    return { available: account.available, reserved: account.reserved, total: account.available + account.reserved };
}
