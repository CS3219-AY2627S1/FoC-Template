import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateDistanceMeters, rankByDistance } from "../src/stub/distance-service.stub.ts";

test("same point is zero distance", () => {
    const p = { latitude: 1.2966, longitude: 103.7764 };
    assert.equal(estimateDistanceMeters(p, p), 0);
});

test("0.001 degree of latitude is about 111 metres", () => {
    const from = { latitude: 1.2966, longitude: 103.7764 };
    const to = { latitude: 1.2976, longitude: 103.7764 };
    assert.ok(Math.abs(estimateDistanceMeters(from, to) - 111.32) < 0.5);
});

test("ranks suppliers farthest first", () => {
    const delivery = { latitude: 1.2966, longitude: 103.7764 };
    const ranked = rankByDistance(delivery, [
        { supplierId: "near", latitude: 1.2967, longitude: 103.7764 },
        { supplierId: "far", latitude: 1.3100, longitude: 103.7764 },
        { supplierId: "mid", latitude: 1.3000, longitude: 103.7764 },
    ]);

    assert.deepEqual(ranked.map((r) => r.supplierId), ["far", "mid", "near"]);
});
