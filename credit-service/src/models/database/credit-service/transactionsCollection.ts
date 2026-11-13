import { client } from "../../../config/db.ts";
import type { ClientSession } from "mongodb";
import type { Transaction } from "../../../types/credit.ts";

const database = client.db('credit-service');
const collection = database.collection('transactions');

export async function insertTransaction(transaction: Transaction, session?: ClientSession) {
    return collection.insertOne(transaction, { session });
}

export async function findTransactionsByUserId(userId: string) {
    return collection.find({ userId }).toArray();
}

export async function findTransactionsByErrandRef(errandRef: string) {
    return collection.find({ errandRef }).toArray();
}

// F4.5.3 (admin): the whole ledger for the dashboard, newest first, one page at a time. An optional
// userId scopes it to one account. Count and page come back together so the caller builds a
// Paginated response without a second round trip.
export async function findTransactions({ userId, page, pageSize }: { userId?: string; page: number; pageSize: number }) {
    const filter = userId ? { userId } : {};
    const [items, total] = await Promise.all([
        collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
        collection.countDocuments(filter),
    ]);
    return { items, page, pageSize, total };
}
