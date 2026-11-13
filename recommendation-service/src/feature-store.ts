import { urgency, type SupplierStats } from "./scoring.ts";

export type CompletedErrand = {
    supplierId: string;
    eventId: string;
    reward: number;
    itemCount: number;
    distance?: number;
    neededBy?: string;
    postedAt?: string;
};

export type TrainingSample = {
    eventId?: string;
    supplierId?: string;
    rewardOverMarket: number;
    itemFactorInput: number;
    urgencyInput?: number;
    distFactorInput: number;
};

export const TRAINING_PREFIX = "training";

export function trainingSample(prior: SupplierStats | null, errand: CompletedErrand): TrainingSample | null {
    if (!prior || prior.completedCount < 5 || !Number.isFinite(prior.avgReward) || prior.avgReward <= 0) return null;
    // An enabled distance factor cannot be reconstructed from an unmeasured outcome.
    if (prior.avgDist > 0 && errand.distance === undefined) return null;
    const sample = {
        eventId: errand.eventId,
        supplierId: errand.supplierId,
        rewardOverMarket: errand.reward / prior.avgReward - 1,
        itemFactorInput: prior.avgItems > 0 ? errand.itemCount / prior.avgItems - 1 : 0,
        urgencyInput: errand.neededBy && errand.postedAt ? urgency(errand.neededBy, new Date(errand.postedAt).getTime()) : 0,
        distFactorInput: prior.avgDist > 0 ? errand.distance! / prior.avgDist - 1 : 0,
    };
    return [sample.rewardOverMarket, sample.itemFactorInput, sample.urgencyInput, sample.distFactorInput].every(Number.isFinite) ? sample : null;
}

const ALPHA = 0.2;

const blend = (prev: number, observed: number) => ALPHA * observed + (1 - ALPHA) * prev;

export function ewmaUpdate(prev: SupplierStats | null, errand: CompletedErrand): SupplierStats {
    if (!prev || prev.completedCount === 0) {
        return {
            completedCount: 1,
            avgReward: errand.reward,
            avgItems: errand.itemCount,
            avgDist: errand.distance ?? 0,
            lastEventId: errand.eventId,
            updatedAt: new Date().toISOString(),
        };
    }

    return {
        completedCount: prev.completedCount + 1,
        avgReward: blend(prev.avgReward, errand.reward),
        avgItems: blend(prev.avgItems, errand.itemCount),
        avgDist: errand.distance === undefined ? prev.avgDist : blend(prev.avgDist, errand.distance),
        lastEventId: errand.eventId,
        updatedAt: new Date().toISOString(),
    };
}

export interface FeatureStore {
    get(supplierId: string): Promise<SupplierStats | null>;
    // A redelivery returns the original sample so export can safely be retried.
    apply(errand: CompletedErrand): Promise<TrainingSample | null>;
}

export class InMemoryFeatureStore implements FeatureStore {
    private readonly stats = new Map<string, SupplierStats>();
    private readonly receipts = new Map<string, TrainingSample | null>();

    async get(supplierId: string): Promise<SupplierStats | null> {
        return this.stats.get(supplierId) ?? null;
    }

    async apply(errand: CompletedErrand): Promise<TrainingSample | null> {
        if (this.receipts.has(errand.eventId)) return this.receipts.get(errand.eventId)!;
        const prev = this.stats.get(errand.supplierId) ?? null;
        if (prev && prev.lastEventId === errand.eventId) return null;
        const sample = trainingSample(prev, errand);
        this.stats.set(errand.supplierId, ewmaUpdate(prev, errand));
        this.receipts.set(errand.eventId, sample);
        return sample;
    }
}
