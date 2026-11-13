import dotenv from "dotenv";
import { MongoClient, type ClientSession } from 'mongodb';

dotenv.config();

const uri = process.env.MONGO_URL ?? "mongodb://localhost:27017/credit-service";

const client = new MongoClient(uri);

export async function ensureIndexes() {
    const db = client.db('credit-service');
    await db.collection('accounts').createIndex({ userId: 1 }, { unique: true });
    await db.collection('reservations').createIndex(
        { errandRef: 1 },
        { unique: true, partialFilterExpression: { status: 'active' } }
    );
    await db.collection('transactions').createIndex({ userId: 1 });
    await db.collection('transactions').createIndex({ errandRef: 1 });
    // The admin ledger sorts the whole collection newest first; this index keeps that off a full scan.
    await db.collection('transactions').createIndex({ createdAt: -1 });
}

export async function connectDB() {
    await client.connect();
    await ensureIndexes();
    console.log("MongoDB connected");
}

export async function closeDB() {
    await client.close();
}

// Runs fn inside one multi-document transaction so the balance move, the reservation and the
// ledger entry commit all-or-nothing (N4.1.2). Needs credit-db to be a replica set.
export async function withTxn<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = client.startSession();
    try {
        let result: T;
        await session.withTransaction(async () => { result = await fn(session); });
        return result! as T;
    } finally {
        await session.endSession();
    }
}

export { client };
export default connectDB;
