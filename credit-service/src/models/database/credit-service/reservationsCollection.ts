import { client } from "../../../config/db.ts";
import type { ClientSession } from "mongodb";
import type { Reservation } from "../../../types/credit.ts";

const database = client.db('credit-service');
const collection = database.collection('reservations');
const references = database.collection<{ _id: string; closed: boolean; version: number }>('reservation_references');

// Every reserve/transfer/release writes this reference inside its transaction.
// Conflicting transactions retry, so a late reserve cannot pass a completed release.
export async function lockReservationReference(errandRef: string, session: ClientSession) {
    return references.findOneAndUpdate({ _id: errandRef }, {
        $inc: { version: 1 }, $setOnInsert: { closed: false },
    }, { upsert: true, returnDocument: 'after', session });
}

export async function closeReservationReference(errandRef: string, session: ClientSession) {
    await references.updateOne({ _id: errandRef }, { $set: { closed: true } }, { session });
}

export async function insertReservation(reservation: Reservation, session?: ClientSession) {
    return collection.insertOne(reservation, { session });
}

export async function findActiveReservation(errandRef: string, session?: ClientSession) {
    return collection.findOne({ errandRef, status: 'active' }, { session });
}

// Move an active reservation to a terminal state, guarded so only one concurrent caller wins
// (modifiedCount is 1 for the winner, 0 for a repeat). This is what makes transfer/release idempotent.
export async function setReservationStatusIfActive(errandRef: string, status: Reservation['status'], session?: ClientSession) {
    const r = await collection.updateOne({ errandRef, status: 'active' }, { $set: { status } }, { session });
    return r.modifiedCount === 1;
}
