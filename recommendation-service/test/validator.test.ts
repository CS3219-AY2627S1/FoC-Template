import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRecommendationRequest } from "../src/validator.ts";

test("accepts a valid request", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = validateRecommendationRequest({
        supplierId: "sup-1",
        location: "COM1 Level 2",
        neededBy: future,
        items: ["Nasi Lemak", "Teh Tarik"],
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.data.items, ["Nasi Lemak", "Teh Tarik"]);
});

test("accepts and keeps an optional distance", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = validateRecommendationRequest({
        supplierId: "sup-1",
        location: "COM1 Level 2",
        neededBy: future,
        items: ["Nasi Lemak"],
        distance: 420,
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.distance, 420);
});

test("rejects a negative distance", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = validateRecommendationRequest({
        supplierId: "sup-1",
        location: "COM1 Level 2",
        neededBy: future,
        items: ["Nasi Lemak"],
        distance: -5,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.some((e) => e.toLowerCase().includes("distance")));
});

test("returns every error and no recommendation when several rules break at once", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = validateRecommendationRequest({
        supplierId: "",
        location: "A",
        neededBy: past,
        items: [],
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.errors.length, 4);
        assert.ok(result.errors.some((e) => e.includes("pickup")));
        assert.ok(result.errors.some((e) => e.includes("drop-off")));
        assert.ok(result.errors.some((e) => e.includes("needed-by")));
        assert.ok(result.errors.some((e) => e.includes("item")));
    }
    assert.ok(!("data" in result));
});
