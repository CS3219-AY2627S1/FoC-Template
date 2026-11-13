import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_WEIGHTS, type Weights } from "./scoring.ts";
import { logger } from "./lib/logger.ts";

export type WeightsProviderOptions = {
    table?: string;
    region: string;
    endpoint?: string;
    refreshMs?: number;
};

export function isValidWeights(value: unknown): value is Weights {
    if (!value || typeof value !== "object") return false;
    const weights = value as Weights;
    return [weights.a, weights.b, weights.c].every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 2);
}

export class WeightsProvider {
    private current: Weights = DEFAULT_WEIGHTS;
    private readonly doc?: DynamoDBDocumentClient;
    private readonly table?: string;
    private timer?: NodeJS.Timeout;

    constructor(opts: WeightsProviderOptions) {
        if (opts.table) {
            this.table = opts.table;
            this.doc = DynamoDBDocumentClient.from(
                new DynamoDBClient({ region: opts.region, endpoint: opts.endpoint }),
            );
            void this.refresh();
            this.timer = setInterval(() => void this.refresh(), opts.refreshMs ?? 30 * 60 * 1000);
            this.timer.unref?.();
        }
    }

    get(): Weights {
        return this.current;
    }

    async refresh(): Promise<void> {
        if (!this.doc || !this.table) return;
        try {
            const { Item } = await this.doc.send(new GetCommand({ TableName: this.table, Key: { id: "current" } }));
            if (isValidWeights(Item)) {
                this.current = { a: Item.a, b: Item.b, c: Item.c };
                logger.info({ weights: this.current }, "reloaded scorer weights");
            }
        } catch (err) {
            logger.error({ err }, "failed to reload scorer weights, keeping current");
        }
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
    }
}
