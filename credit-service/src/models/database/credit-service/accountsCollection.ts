import { client } from "../../../config/db.ts";
import type { ClientSession } from "mongodb";
import type { CreditAccount } from "../../../types/credit.ts";

const database = client.db('credit-service');
const collection = database.collection('accounts');

export async function insertAccount(account: CreditAccount) {
    return collection.insertOne(account);
}

export async function findAccountByUserId(userId: string) {
    return collection.findOne({ userId });
}

// Move available -> reserved in one atomic step, only if enough is available. The guard and the
// deduction are the same operation, so two concurrent reserves cannot both pass the check (N4.1.1).
export async function reserveAtomic(userId: string, amount: number, session?: ClientSession) {
    const r = await collection.updateOne({ userId, available: { $gte: amount } }, { $inc: { available: -amount, reserved: amount } }, { session });
    return r.matchedCount === 1;
}

export async function debitReserved(userId: string, amount: number, session?: ClientSession) {
    const r = await collection.updateOne({ userId }, { $inc: { reserved: -amount } }, { session });
    return r.matchedCount === 1;
}

export async function creditAvailable(userId: string, amount: number, session?: ClientSession) {
    const r = await collection.updateOne({ userId }, { $inc: { available: amount } }, { session });
    return r.matchedCount === 1;
}

export async function releaseToAvailable(userId: string, amount: number, session?: ClientSession) {
    const r = await collection.updateOne({ userId }, { $inc: { available: amount, reserved: -amount } }, { session });
    return r.matchedCount === 1;
}
