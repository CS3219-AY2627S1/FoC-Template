import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { logger } from "./lib/logger.ts";

export type RecommendationLogEntry = {
    requestId: string;
    inputs: unknown;
    recommended: number;
    basis: string;
    version: string;
    latencyMs: number;
    ts: string;
};

export type RecommendationLogOptions = {
    bucket?: string;
    region: string;
    endpoint?: string;
    flushMs?: number;
    maxBatch?: number;
    maxBuffer?: number;
    prefix?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export class RecommendationLog<Entry extends object = RecommendationLogEntry> {
    private buffer: Entry[] = [];
    private readonly s3?: S3Client;
    private readonly bucket?: string;
    private readonly maxBatch: number;
    private readonly maxBuffer: number;
    private readonly prefix: string;
    private timer?: NodeJS.Timeout;

    constructor(opts: RecommendationLogOptions) {
        this.bucket = opts.bucket;
        this.maxBatch = opts.maxBatch ?? 100;
        this.maxBuffer = opts.maxBuffer ?? 10_000;
        this.prefix = opts.prefix ?? "recommendations";
        if (this.bucket) {
            this.s3 = new S3Client({ region: opts.region, endpoint: opts.endpoint });
            this.timer = setInterval(() => void this.flush(), opts.flushMs ?? 10_000);
            this.timer.unref?.();
        } else {
            logger.warn("S3_BUCKET not set, recommendation logging disabled");
        }
    }

    record(entry: Entry): void {
        if (!this.bucket) return;
        this.buffer.push(entry);
        if (this.buffer.length > this.maxBuffer) {
            const dropped = this.buffer.length - this.maxBuffer;
            this.buffer.splice(0, dropped);
            logger.warn({ dropped }, "recommendation log buffer full, dropped oldest entries");
        }
        if (this.buffer.length >= this.maxBatch) void this.flush();
    }

    async recordDurably(entry: Entry, eventId: string): Promise<void> {
        if (!this.s3 || !this.bucket) return;
        // Stable keys make a broker redelivery an overwrite rather than another observation.
        await this.s3.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: `${this.prefix}/events/${encodeURIComponent(eventId)}.ndjson`,
            Body: JSON.stringify(entry) + "\n",
            ContentType: "application/x-ndjson",
        }));
    }

    async flush(): Promise<void> {
        if (!this.s3 || !this.bucket || this.buffer.length === 0) return;
        const batch = this.buffer;
        this.buffer = [];
        const body = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
        const now = new Date();
        const key = `${this.prefix}/${now.getUTCFullYear()}/${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())}/${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.ndjson`;
        try {
            await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: "application/x-ndjson" }));
        } catch (err) {
            this.buffer.unshift(...batch);
            logger.error({ err, pending: this.buffer.length }, "failed to ship recommendation log to S3, will retry");
        }
    }

    async stop(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
        await this.flush();
    }
}
