import { test } from "node:test";
import assert from "node:assert/strict";
import { countItems, recommendScore, type SupplierStats } from "../src/scoring.ts";

const farFuture = () => new Date(Date.now() + 48 * 3_600_000).toISOString();

const base = { lastEventId: "evt-0", updatedAt: "2026-01-01T00:00:00.000Z" };

test("cold start: fewer than 3 completed errands returns the flat default", () => {
    const stats: SupplierStats = { completedCount: 2, avgReward: 30, avgItems: 4, avgDist: 10, ...base };
    const result = recommendScore({ items: ["a", "b"], neededBy: farFuture(), distance: 10 }, stats);

    assert.equal(result.recommendedCredits, 10);
    assert.equal(result.basis, "default");
});

test("clamps to the floor of 1 when the formula would go below it", () => {
    const stats: SupplierStats = { completedCount: 10, avgReward: 2, avgItems: 10, avgDist: 10, ...base };
    const result = recommendScore({ items: [], neededBy: farFuture(), distance: 0 }, stats);

    assert.equal(result.recommendedCredits, 1);
    assert.equal(result.basis, "formula");
});

test("clamps to the ceiling of 50 when the formula would overshoot", () => {
    const stats: SupplierStats = { completedCount: 10, avgReward: 40, avgItems: 2, avgDist: 1, ...base };
    const result = recommendScore({ items: ["a", "b"], neededBy: farFuture(), distance: 1000 }, stats);

    assert.equal(result.recommendedCredits, 50);
    assert.equal(result.basis, "formula");
});

test("normal case: a perfectly average errand returns the market rate", () => {
    const stats: SupplierStats = { completedCount: 10, avgReward: 20, avgItems: 4, avgDist: 10, ...base };
    const result = recommendScore({ items: ["a", "b", "c", "d"], neededBy: farFuture(), distance: 10 }, stats);

    assert.equal(result.recommendedCredits, 20);
    assert.equal(result.basis, "formula");
    assert.equal(result.contributions.multiplier, 1);
});

test("countItems counts comma-separated tokens, even when one field holds several", () => {
    assert.equal(countItems(["coffee", "sandwich"]), 2);
    assert.equal(countItems(["coffee, sandwich", "juice"]), 3);
    assert.equal(countItems([]), 0);
});

test("a farther-than-average delivery raises the recommendation via the distance factor", () => {
    const stats: SupplierStats = { completedCount: 10, avgReward: 20, avgItems: 2, avgDist: 10, ...base };
    const result = recommendScore({ items: ["a", "b"], neededBy: farFuture(), distance: 20 }, stats);

    assert.equal(result.contributions.distanceFactor, 0.3);
    assert.equal(result.recommendedCredits, 26);
});
