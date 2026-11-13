import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ewmaUpdate, trainingSample, type CompletedErrand, type FeatureStore, type TrainingSample } from "./feature-store.ts";
import type { SupplierStats } from "./scoring.ts";

export type DynamoFeatureStoreOptions = {
    tableName: string;
    region: string;
    endpoint?: string;
};

export class DynamoFeatureStore implements FeatureStore {
    private readonly doc: DynamoDBDocumentClient;
    private readonly table: string;

    constructor(opts: DynamoFeatureStoreOptions) {
        this.table = opts.tableName;
        this.doc = DynamoDBDocumentClient.from(
            new DynamoDBClient({ region: opts.region, endpoint: opts.endpoint }),
        );
    }

    async get(supplierId: string): Promise<SupplierStats | null> {
        const { Item } = await this.doc.send(
            new GetCommand({ TableName: this.table, Key: { supplierId }, ConsistentRead: true }),
        );
        return (Item as SupplierStats | undefined) ?? null;
    }

    async apply(errand: CompletedErrand): Promise<TrainingSample | null> {
        const receiptKey = { supplierId: `__event#${errand.eventId}` };
        const readReceipt = () => this.doc.send(new GetCommand({ TableName: this.table, Key: receiptKey, ConsistentRead: true }));
        const receipt = await readReceipt();
        if (receipt.Item) return receipt.Item.sample as TrainingSample | null;
        const prev = await this.get(errand.supplierId);
        if (prev && prev.lastEventId === errand.eventId) return null;
        const next = ewmaUpdate(prev, errand);
        const sample = trainingSample(prev, errand);

        try {
            await this.doc.send(
                new TransactWriteCommand({
                    TransactItems: [
                        { Put: {
                            TableName: this.table,
                            Item: { supplierId: errand.supplierId, ...next },
                            ConditionExpression: prev ? "completedCount = :cc AND lastEventId = :previous" : "attribute_not_exists(supplierId)",
                            ...(prev ? { ExpressionAttributeValues: { ":cc": prev.completedCount, ":previous": prev.lastEventId } } : {}),
                        } },
                        { Put: {
                            TableName: this.table,
                            Item: { ...receiptKey, sample },
                            ConditionExpression: "attribute_not_exists(supplierId)",
                        } },
                    ],
                }),
            );
        } catch (err) {
            if (err instanceof TransactionCanceledException) {
                const saved = await readReceipt();
                if (saved.Item) return saved.Item.sample as TrainingSample | null;
            }
            throw err;
        }
        return sample;
    }
}
