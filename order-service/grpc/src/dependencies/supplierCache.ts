// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: generated Redis supplier cache, versioned writes and gRPC fallback lookup.
// Author review: By @sunpterodactyl looks good but will warm the cache on next prompt.
import { z } from 'zod';
import { grpcsupplierSchema } from '@foc/grpc';
import type { Redis } from 'ioredis';
import { toSupplierRpcId } from './supplierErrorHelper';



// Field names follow the supplier.updated contract; coordinates stay numeric as gRPC returns them.
export const supplierRecordSchema = z.object({
  supplierId: z.string().regex(/^[1-9][0-9]*$/),
  name: z.string().max(255),
  buildingName: z.string().max(255),
  floor: z.number().int(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  pickupLocation: z.string(),
});
export type SupplierRecord = z.infer<typeof supplierRecordSchema>;

// An entry without `supplier` marks the key stale (being refreshed, or deleted):
// reads fall through to gRPC, and the version stops older writes from landing.
const cacheEntrySchema = z.object({
  updatedAtMs: z.number().int().nonnegative(),
  supplier: supplierRecordSchema.optional(),
});
type CacheEntry = z.infer<typeof cacheEntrySchema>;

export function toSupplierRecord(response: unknown): SupplierRecord {
  const supplier = grpcsupplierSchema.parse(response);
  return {
    supplierId: supplier.supplierId,
    name: supplier.name,
    buildingName: supplier.buildingName,
    floor: supplier.floor,
    latitude: supplier.latitude,
    longitude: supplier.longitude,
    pickupLocation: `${supplier.latitude}, ${supplier.longitude}`,
  };
}

export const supplierCacheKey = (supplierId: string) => `supplier:${supplierId}`;

// Writes ARGV[1] unless the cached entry carries a newer updatedAtMs. Equal versions
// still write so a retried event can finish a write that crashed before the ack.
const WRITE_UNLESS_NEWER = `
local current = redis.call('GET', KEYS[1])
if current then
  local ok, entry = pcall(cjson.decode, current)
  if ok and type(entry) == 'table' and type(entry.updatedAtMs) == 'number'
    and entry.updatedAtMs > tonumber(ARGV[2]) then
    return 0
  end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return 1
`;

export type SupplierCacheClient = Pick<Redis, 'get' | 'set' | 'eval'>;

export type SupplierCache = ReturnType<typeof createSupplierCache>;

export function createSupplierCache(redis: SupplierCacheClient, ttlSeconds: number) {
  async function writeUnlessNewer(supplierId: string, entry: CacheEntry): Promise<boolean> {
    const written = await redis.eval(WRITE_UNLESS_NEWER, 1, supplierCacheKey(supplierId),
      JSON.stringify(entry), String(entry.updatedAtMs), String(ttlSeconds));
    return written === 1;
  }

  return {
    // Never throws: any Redis or decoding problem is a miss.
    async read(supplierId: string): Promise<SupplierRecord | undefined> {
      try {
        const raw = await redis.get(supplierCacheKey(supplierId));
        if (raw === null) return undefined;
        const entry = cacheEntrySchema.safeParse(JSON.parse(raw));
        if (!entry.success || entry.data.supplier?.supplierId !== supplierId) return undefined;
        return entry.data.supplier;
      } catch (error) {
        console.warn('Supplier cache read failed; using gRPC', { supplierId, message: (error as Error).message });
        return undefined;
      }
    },

    // Fill after a gRPC miss. NX so it never replaces an event-written or stale-marked entry;
    // version 0 lets the next supplier event overwrite it.
    async fill(supplier: SupplierRecord): Promise<void> {
      try {
        const entry: CacheEntry = { updatedAtMs: 0, supplier: supplierRecordSchema.parse(supplier) };
        await redis.set(supplierCacheKey(supplier.supplierId), JSON.stringify(entry), 'EX', ttlSeconds, 'NX');
      } catch (error) {
        console.warn('Supplier cache fill failed', { supplierId: supplier.supplierId, message: (error as Error).message });
      }
    },

    // The consumer's writes throw so the broker retries instead of acking a lost update.
    invalidate(supplierId: string, updatedAtMs: number): Promise<boolean> {
      return writeUnlessNewer(supplierId, { updatedAtMs });
    },

    store(supplier: SupplierRecord, updatedAtMs: number): Promise<boolean> {
      return writeUnlessNewer(supplier.supplierId, { updatedAtMs, supplier: supplierRecordSchema.parse(supplier) });
    },
  };
}

type SupplierRpc = { getSupplier(request: { supplierId: number }): Promise<unknown> };

export function createSupplierLookup(client: SupplierRpc, cache?: SupplierCache) {
  async function fetchSupplier(supplierId: string): Promise<SupplierRecord> {
    return toSupplierRecord(await client.getSupplier({ supplierId: toSupplierRpcId(supplierId) }));
  }

  return {
    fetchSupplier,
    async getSupplier(supplierId: string): Promise<SupplierRecord> {
      const cached = await cache?.read(supplierId);
      if (cached) return cached;
      const supplier = await fetchSupplier(supplierId);
      await cache?.fill(supplier);
      return supplier;
    },
  };
}
