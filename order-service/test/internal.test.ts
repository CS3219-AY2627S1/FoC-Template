import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { createInternalRouter } from "../src/controllers/internal.controller.ts";

const orders: Record<number, any> = {
    42: { id: 42, requester_id: "requester", courier_id: "courier", status: "Delivered" },
    43: { id: 43, requester_id: "requester", courier_id: null, status: "Open" },
    44: { id: 44, requester_id: "requester", courier_id: null, status: "Pending" },
    45: { id: 45, requester_id: "requester", courier_id: null, status: "Rejected" },
};

async function withServer(run: (base: string, asked: number[]) => Promise<void>) {
    const asked: number[] = [];
    const app = express().use("/internal", createInternalRouter(async (id) => {
        asked.push(id);
        return orders[id] ?? null;
    }));
    const server = app.listen(0);
    try {
        await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked);
    } finally {
        server.close();
    }
}

test("an errand answers with its id, requester, courier and state", async () => {
    await withServer(async (base) => {
        const accepted = await fetch(`${base}/internal/orders/42`);
        assert.equal(accepted.status, 200);
        assert.deepEqual(await accepted.json(), { id: "42", requesterId: "requester", courierId: "courier", status: "Delivered" });
        const open = await fetch(`${base}/internal/orders/43`);
        assert.deepEqual(await open.json(), { id: "43", requesterId: "requester", courierId: null, status: "Open" });
    });
});

test("an unknown, malformed, pending or rejected errand is not found", async () => {
    await withServer(async (base, asked) => {
        for (const id of ["7", "44", "45", "abc", "1.5", "99999999999"]) {
            const response = await fetch(`${base}/internal/orders/${id}`);
            assert.equal(response.status, 404, id);
            assert.deepEqual(await response.json(), { error: "ORDER_NOT_FOUND" });
        }
        assert.deepEqual(asked, [7, 44, 45], "only ids that fit the orders table reach the database");
    });
});
