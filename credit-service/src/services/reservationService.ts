import { reserveAtomic, debitReserved, creditAvailable, releaseToAvailable } from "../models/database/credit-service/accountsCollection.ts";
import { findActiveReservation, insertReservation, setReservationStatusIfActive, lockReservationReference, closeReservationReference } from "../models/database/credit-service/reservationsCollection.ts";
import { insertTransaction } from "../models/database/credit-service/transactionsCollection.ts";
import { withTxn } from "../config/db.ts";

export async function reserveCredits(userId: string, errandRef: string, amount: number): Promise<void> {
    if (amount <= 0 || !Number.isInteger(amount)) throw new Error('Amount must be a positive whole number');
    await withTxn(async (session) => {
        const reference = await lockReservationReference(errandRef, session);
        if (reference?.closed) throw new Error('Errand reference is closed');
        const existing = await findActiveReservation(errandRef, session);
        if (existing) {
            if (existing.userId !== userId || existing.amount !== amount) throw new Error('Reservation does not match this errand');
            return;
        }
        const reserved = await reserveAtomic(userId, amount, session);
        if (!reserved) throw new Error('Insufficient available credits');
        await insertReservation({ userId, errandRef, amount, status: 'active', createdAt: new Date() }, session);
        await insertTransaction({ userId, errandRef, type: 'reservation', amount, createdAt: new Date() }, session);
    });
}

export async function transferCredits(errandRef: string, courierId: string): Promise<void> {
    await withTxn(async (session) => {
        await lockReservationReference(errandRef, session);
        await closeReservationReference(errandRef, session);
        const reservation = await findActiveReservation(errandRef, session);
        if (!reservation) return;
        const claimed = await setReservationStatusIfActive(errandRef, 'transferred', session);
        if (!claimed) return; // a concurrent transfer/release already handled this errand
        const debited = await debitReserved(reservation.userId, reservation.amount, session);
        if (!debited) throw new Error('Requester account not found');
        const credited = await creditAvailable(courierId, reservation.amount, session);
        if (!credited) throw new Error('Courier account not found');
        await insertTransaction({ userId: courierId, errandRef, type: 'transfer', amount: reservation.amount, createdAt: new Date() }, session);
    });
}

export async function releaseCredits(errandRef: string): Promise<void> {
    await withTxn(async (session) => {
        await lockReservationReference(errandRef, session);
        await closeReservationReference(errandRef, session);
        const reservation = await findActiveReservation(errandRef, session);
        if (!reservation) return;
        const claimed = await setReservationStatusIfActive(errandRef, 'released', session);
        if (!claimed) return;
        const released = await releaseToAvailable(reservation.userId, reservation.amount, session);
        if (!released) throw new Error('Account not found');
        await insertTransaction({ userId: reservation.userId, errandRef, type: 'release', amount: reservation.amount, createdAt: new Date() }, session);
    });
}
