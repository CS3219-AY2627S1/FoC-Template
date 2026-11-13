export const SCORER_VERSION = "v1";

const A = 0.5;
const B = 0.5;
const C = 0.3;

export type Weights = { a: number; b: number; c: number };

export const DEFAULT_WEIGHTS: Weights = { a: A, b: B, c: C };

const URGENCY_HORIZON_HOURS = 24;

const COLD_START_THRESHOLD = 3;
const COLD_START_CREDITS = 10;
const CREDIT_MIN = 1;
const CREDIT_MAX = 50;

export type ScoreInput = {
    items: string[];
    neededBy: string;
    distance: number;
};

export type SupplierStats = {
    completedCount: number;
    avgReward: number;
    avgItems: number;
    avgDist: number;
    lastEventId: string;
    updatedAt: string;
};

export type ScoreResult = {
    recommendedCredits: number;
    basis: "formula" | "default";
    contributions: {
        marketRate: number;
        weights: Weights;
        items: number;
        avgItems: number;
        itemFactor: number;
        urgency: number;
        urgencyFactor: number;
        distance: number;
        avgDist: number;
        distanceFactor: number;
        multiplier: number;
    };
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ponytail: counts comma-separated tokens, so "coffee, sandwich" in one field still counts as 2.
// Equals items.length when the caller already split on commas (today's frontend does).
export function countItems(items: string[]): number {
    return items
        .join(",")
        .split(",")
        .filter((token) => token.trim() !== "").length;
}

export function urgency(neededBy: string, now: number = Date.now()): number {
    const hoursUntil = (new Date(neededBy).getTime() - now) / 3_600_000;
    if (!Number.isFinite(hoursUntil)) return 0;
    return clamp((URGENCY_HORIZON_HOURS - hoursUntil) / URGENCY_HORIZON_HOURS, 0, 1);
}

export function recommendScore(input: ScoreInput, stats: SupplierStats, weights: Weights = DEFAULT_WEIGHTS): ScoreResult {
    const mkt = stats.avgReward;
    const items = countItems(input.items);
    const urgencyValue = urgency(input.neededBy);

    if (stats.completedCount < COLD_START_THRESHOLD) {
        return {
            recommendedCredits: COLD_START_CREDITS,
            basis: "default",
            contributions: {
                marketRate: mkt, weights,
                items, avgItems: stats.avgItems, itemFactor: 0,
                urgency: urgencyValue, urgencyFactor: 0,
                distance: input.distance, avgDist: stats.avgDist, distanceFactor: 0,
                multiplier: 1,
            },
        };
    }

    const itemFactor = weights.a * (stats.avgItems > 0 ? items / stats.avgItems - 1 : 0);
    const urgencyFactor = weights.b * urgencyValue;
    const distanceFactor = weights.c * (stats.avgDist > 0 ? input.distance / stats.avgDist - 1 : 0);
    const multiplier = 1 + itemFactor + urgencyFactor + distanceFactor;

    const recommendedCredits = clamp(Math.round(mkt * multiplier), CREDIT_MIN, CREDIT_MAX);

    return {
        recommendedCredits,
        basis: "formula",
        contributions: {
            marketRate: mkt, weights,
            items, avgItems: stats.avgItems, itemFactor,
            urgency: urgencyValue, urgencyFactor,
            distance: input.distance, avgDist: stats.avgDist, distanceFactor,
            multiplier,
        },
    };
}
