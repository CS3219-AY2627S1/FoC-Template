import { pathToFileURL } from "node:url";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_WEIGHTS, type Weights } from "../scoring.ts";
import { TRAINING_PREFIX, type TrainingSample } from "../feature-store.ts";
import { config } from "../config.ts";
import { isValidWeights } from "../weights.ts";

const MIN_SAMPLES = 20;
const WEIGHT_MIN = 0;
const WEIGHT_MAX = 2;

export function validSamples(records: unknown[]): TrainingSample[] {
    const seen = new Set<string>();
    return records.filter((record): record is TrainingSample => {
        if (!record || typeof record !== "object") return false;
        const s = record as TrainingSample;
        if (![s.itemFactorInput, s.distFactorInput, s.rewardOverMarket].every(v => typeof v === "number" && Number.isFinite(v))) return false;
        if (s.eventId !== undefined) {
            if (typeof s.eventId !== "string" || !s.eventId || seen.has(s.eventId)) return false;
            seen.add(s.eventId);
        }
        return true;
    });
}

const FEATURE_EPS = 1e-12;

export function refitWeights(records: unknown[], current: Weights = DEFAULT_WEIGHTS): Weights {
    const samples = validSamples(records);
    if (samples.length < MIN_SAMPLES) return current;

    let sii = 0, siu = 0, sid = 0, suu = 0, sud = 0, sdd = 0, siy = 0, suy = 0, sdy = 0;
    for (const s of samples) {
        const xi = s.itemFactorInput;
        const xu = Number.isFinite(s.urgencyInput) ? s.urgencyInput! : 0;
        const xd = s.distFactorInput;
        const y = s.rewardOverMarket;
        sii += xi * xi; siu += xi * xu; sid += xi * xd;
        suu += xu * xu; sud += xu * xd; sdd += xd * xd;
        siy += xi * y; suy += xu * y; sdy += xd * y;
    }
    if (![sii, siu, sid, suu, sud, sdd, siy, suy, sdy].every(Number.isFinite)) return current;

    const ai = sii > FEATURE_EPS, au = suu > FEATURE_EPS, ad = sdd > FEATURE_EPS;
    if (!ai && !au && !ad) return current;

    const ri = siy - (au ? 0 : current.b * siu) - (ad ? 0 : current.c * sid);
    const ru = suy - (ai ? 0 : current.a * siu) - (ad ? 0 : current.c * sud);
    const rd = sdy - (ai ? 0 : current.a * sid) - (au ? 0 : current.b * sud);
    const singular = (det: number, scale: number) => !Number.isFinite(scale) || Math.abs(det) <= 1e-9 * scale;

    let a = current.a, b = current.b, c = current.c;
    if (ai && au && ad) {
        const det = sii * (suu * sdd - sud * sud) - siu * (siu * sdd - sud * sid) + sid * (siu * sud - suu * sid);
        if (singular(det, sii * suu * sdd)) return current;
        a = (ri * (suu * sdd - sud * sud) - siu * (ru * sdd - sud * rd) + sid * (ru * sud - suu * rd)) / det;
        b = (sii * (ru * sdd - rd * sud) - ri * (siu * sdd - sud * sid) + sid * (siu * rd - ru * sid)) / det;
        c = (sii * (suu * rd - ru * sud) - siu * (siu * rd - ru * sid) + ri * (siu * sud - suu * sid)) / det;
    } else if (ai && ad) {
        const det = sii * sdd - sid * sid;
        if (singular(det, sii * sdd)) return current;
        a = (ri * sdd - rd * sid) / det;
        c = (rd * sii - ri * sid) / det;
    } else if (ai && au) {
        const det = sii * suu - siu * siu;
        if (singular(det, sii * suu)) return current;
        a = (ri * suu - ru * siu) / det;
        b = (ru * sii - ri * siu) / det;
    } else if (au && ad) {
        const det = suu * sdd - sud * sud;
        if (singular(det, suu * sdd)) return current;
        b = (ru * sdd - rd * sud) / det;
        c = (rd * suu - ru * sud) / det;
    } else if (ai) {
        a = ri / sii;
    } else if (au) {
        b = ru / suu;
    } else {
        c = rd / sdd;
    }

    if (![a, b, c].every(Number.isFinite)) return current;
    const clamp = (n: number) => Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, n));
    return { a: clamp(a), b: clamp(b), c: clamp(c) };
}

export async function main(): Promise<void> {
    if (!config.S3_BUCKET) throw new Error("S3_BUCKET is required");

    const s3 = new S3Client({ region: config.AWS_REGION, endpoint: config.S3_ENDPOINT });
    const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.AWS_REGION, endpoint: config.DYNAMODB_ENDPOINT }));
    try {
        const { Item } = await doc.send(new GetCommand({ TableName: config.SCORER_WEIGHTS_TABLE, Key: { id: "current" }, ConsistentRead: true }));
        if (Item && !isValidWeights(Item)) throw new Error("Stored scorer weights are invalid; refusing to overwrite them");
        const current: Weights = Item ? { a: Item.a, b: Item.b, c: Item.c } : { ...DEFAULT_WEIGHTS };
        const records: unknown[] = [];
        let malformedLines = 0;
        let token: string | undefined;
        do {
            const page = await s3.send(new ListObjectsV2Command({ Bucket: config.S3_BUCKET, Prefix: `${TRAINING_PREFIX}/`, ContinuationToken: token }));
            for (const obj of page.Contents ?? []) {
                if (!obj.Key?.endsWith(".ndjson")) continue;
                const got = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: obj.Key }));
                if (!got.Body) throw new Error(`Missing training object body: ${obj.Key}`);
                const text = await got.Body.transformToString();
                for (const line of text.split("\n")) {
                    if (!line.trim()) continue;
                    try { records.push(JSON.parse(line)); } catch { malformedLines++; }
                }
            }
            token = page.IsTruncated ? page.NextContinuationToken : undefined;
            if (page.IsTruncated && !token) throw new Error("Missing training listing continuation token");
        } while (token);

        const samples = validSamples(records);
        const weights = refitWeights(samples, current);
        if (weights === current) {
            console.log(`kept current weights: insufficient or degenerate data (${samples.length} valid samples, ${malformedLines} malformed lines)`);
            return;
        }
        await doc.send(new PutCommand({
            TableName: config.SCORER_WEIGHTS_TABLE,
            Item: { id: "current", ...weights, refitAt: new Date().toISOString(), sampleSize: samples.length },
            // Do not replace a newer trainer's result with a fit based on stale weights.
            ConditionExpression: Item ? "#a = :a AND #b = :b AND #c = :c" : "attribute_not_exists(id)",
            ...(Item ? { ExpressionAttributeNames: { "#a": "a", "#b": "b", "#c": "c" }, ExpressionAttributeValues: { ":a": current.a, ":b": current.b, ":c": current.c } } : {}),
        }));
        console.log(`refit from ${samples.length} valid samples (${malformedLines} malformed lines) ->`, weights);
    } finally {
        s3.destroy();
        doc.destroy();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(err => { console.error(err); process.exitCode = 1; });
}
