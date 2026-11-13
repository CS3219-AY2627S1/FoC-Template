import express from "express";
import helmet from "helmet";
import { healthRouter } from "./routes/health.routes.ts";
import { createRecommendationsRouter } from "./routes/recommendations.routes.ts";
import { InMemoryFeatureStore, TRAINING_PREFIX, type FeatureStore, type TrainingSample } from "./feature-store.ts";
import { DynamoFeatureStore } from "./dynamo-feature-store.ts";
import { RecommendationLog } from "./recommendation-log.ts";
import { WeightsProvider } from "./weights.ts";
import { config } from "./config.ts";

export function createFeatureStore(): FeatureStore {
    if (config.FEATURE_STORE === "dynamodb") {
        return new DynamoFeatureStore({
            tableName: config.DYNAMODB_TABLE,
            region: config.AWS_REGION,
            endpoint: config.DYNAMODB_ENDPOINT,
        });
    }
    return new InMemoryFeatureStore();
}

export function createRecommendationLog(): RecommendationLog {
    return new RecommendationLog({ bucket: config.S3_BUCKET, region: config.AWS_REGION, endpoint: config.S3_ENDPOINT });
}

export function createTrainingLog(): RecommendationLog<TrainingSample> {
    return new RecommendationLog<TrainingSample>({ bucket: config.S3_BUCKET, region: config.AWS_REGION, endpoint: config.S3_ENDPOINT, prefix: TRAINING_PREFIX });
}

export function createWeightsProvider(): WeightsProvider {
    return new WeightsProvider({
        table: config.FEATURE_STORE === "dynamodb" ? config.SCORER_WEIGHTS_TABLE : undefined,
        region: config.AWS_REGION,
        endpoint: config.DYNAMODB_ENDPOINT,
    });
}

export function createApp(
    store: FeatureStore = createFeatureStore(),
    log: RecommendationLog = createRecommendationLog(),
    weights: WeightsProvider = createWeightsProvider(),
) {
    const app = express();

    app.use(helmet());
    app.use(express.json({ limit: "10kb" }));

    app.use(healthRouter);
    app.use(createRecommendationsRouter(store, log, weights));

    return app;
}
