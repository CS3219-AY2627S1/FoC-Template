import { randomUUID } from "node:crypto";
import { Router } from "express";
import { authorize } from "../auth.ts";
import { validateRecommendationRequest } from "../validator.ts";
import { recommendScore, SCORER_VERSION, type SupplierStats } from "../scoring.ts";
import type { FeatureStore } from "../feature-store.ts";
import type { RecommendationLog } from "../recommendation-log.ts";
import type { WeightsProvider } from "../weights.ts";

const COLD_START_STATS: SupplierStats = {
    completedCount: 0,
    avgReward: 0,
    avgItems: 0,
    avgDist: 0,
    lastEventId: "",
    updatedAt: "",
};

export function createRecommendationsRouter(store: FeatureStore, log: RecommendationLog, weights: WeightsProvider): Router {
    const router = Router();

    router.post("/recommendations", authorize(), async (req, res) => {
        const result = validateRecommendationRequest(req.body);
        if (!result.ok) {
            // Shared error envelope the gateway and other services use, so the web client shows the message.
            res.status(400).json({ error: { code: "VALIDATION_ERROR", message: result.errors.join(". ") } });
            return;
        }

        const start = Date.now();
        const { supplierId, items, neededBy, distance } = result.data;
        const stats = (await store.get(supplierId)) ?? COLD_START_STATS;
        const score = recommendScore({ items, neededBy, distance: distance ?? stats.avgDist }, stats, weights.get());
        const latencyMs = Date.now() - start;

        res.json({
            recommendedCredits: score.recommendedCredits,
            basis: score.basis,
            version: SCORER_VERSION,
            features: score.contributions,
        });

        log.record({
            requestId: (req.headers["x-request-id"] as string) ?? randomUUID(),
            inputs: result.data,
            recommended: score.recommendedCredits,
            basis: score.basis,
            version: SCORER_VERSION,
            latencyMs,
            ts: new Date().toISOString(),
        });
    });

    return router;
}
