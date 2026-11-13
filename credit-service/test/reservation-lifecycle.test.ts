import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

let available = 50;
let reserved = 0;
let courierBalance = 50;
const reservations = new Map<string, any>();
const references = new Map<string, { closed: boolean }>();
const ledger: any[] = [];
beforeEach(() => {
    available = 50; reserved = 0; courierBalance = 50;
    reservations.clear(); references.clear(); ledger.length = 0;
});
mock.module("../src/config/db.ts", { namedExports: { withTxn: async (fn: any) => fn({}) } });
mock.module("../src/models/database/credit-service/reservationsCollection.ts", { namedExports: {
    findActiveReservation: async (ref: string) => {
        const value = reservations.get(ref);
        return value?.status === "active" ? { ...value } : null;
    },
    insertReservation: async (value: any) => { reservations.set(value.errandRef, { ...value }); },
    setReservationStatusIfActive: async (ref: string, status: string) => {
        const value = reservations.get(ref);
        if (value?.status !== "active") return false;
        value.status = status;
        return true;
    },
    lockReservationReference: async (ref: string) => {
        if (!references.has(ref)) references.set(ref, { closed: false });
        return references.get(ref);
    },
    closeReservationReference: async (ref: string) => { references.get(ref)!.closed = true; },
} });
mock.module("../src/models/database/credit-service/accountsCollection.ts", { namedExports: {
    reserveAtomic: async (_user: string, amount: number) => {
        if (available < amount) return false;
        available -= amount; reserved += amount; return true;
    },
    releaseToAvailable: async (_user: string, amount: number) => { available += amount; reserved -= amount; return true; },
    debitReserved: async (_user: string, amount: number) => { reserved -= amount; return true; },
    creditAvailable: async (_user: string, amount: number) => { courierBalance += amount; return true; },
} });
mock.module("../src/models/database/credit-service/transactionsCollection.ts", {
    namedExports: { insertTransaction: async (value: any) => { ledger.push(value); } },
});
const { reserveCredits, releaseCredits, transferCredits } = await import("../src/services/reservationService.ts");

test("release before a delayed reservation permanently closes the errand reference", async () => {
    await releaseCredits("cancelled-before-reserve");
    await assert.rejects(reserveCredits("requester", "cancelled-before-reserve", 5), /closed/i);
    assert.equal(available, 50);
    assert.equal(reserved, 0);
    assert.equal(ledger.length, 0);
});

test("reserve and release move the reward once and cannot reopen a terminal reference", async () => {
    await reserveCredits("requester", "cancelled-after-reserve", 5);
    await reserveCredits("requester", "cancelled-after-reserve", 5);
    assert.equal(available, 45);
    assert.equal(reserved, 5);
    await releaseCredits("cancelled-after-reserve");
    await releaseCredits("cancelled-after-reserve");
    await assert.rejects(reserveCredits("requester", "cancelled-after-reserve", 5), /closed/i);
    assert.equal(available, 50);
    assert.equal(reserved, 0);
    assert.equal(ledger.filter((entry) => entry.type === "release").length, 1);
});

test("completion transfers the reserved reward to the courier once", async () => {
    await reserveCredits("requester", "completed", 5);
    await transferCredits("completed", "courier");
    await transferCredits("completed", "courier");
    await releaseCredits("completed");
    assert.equal(available, 45);
    assert.equal(reserved, 0);
    assert.equal(courierBalance, 55);
    assert.equal(ledger.filter((entry) => entry.type === "transfer").length, 1);
});
