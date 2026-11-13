export type RecommendationRequest = {
    supplierId: string;
    location: string;
    neededBy: string;
    items: string[];
    distance?: number;
};

export type RecommendationResponse = {
    recommendedCredits: number;
};

export type ValidationResult =
    | { ok: true; data: RecommendationRequest }
    | { ok: false; errors: string[] };
