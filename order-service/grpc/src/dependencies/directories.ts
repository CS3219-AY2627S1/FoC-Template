// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: getSupplier reads the Redis cache before gRPC; added fetchSupplier for the consumer.
// Author review: Mounted new gRPC call for cache, reviewed by @sunpterodactyl.
// ChatGPT (Codex), 2026-11-04: Use validated Supplier coordinates for the approved pickupLocation string; review pending; see ../../../usage-log.md.
// ChatGPT (Codex), 2026-10-30: Removed unused Supplier IsOpen adapter; human review pending.
// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Integrated approved shared Supplier validation and missing-location placeholder.
// Author review: Pending; see ../../../usage-log.md.

//AI assistance disclosure: ChatGPT (Codex), 2026-10-22.
//Scope:Formatting help to avoid messy try catch when integrating supplierId grpc call error

import {createUserClient,createSupplierClient,} from '@foc/grpc';

import {createSupplierLookup, type SupplierCache} from './supplierCache';


export function createDirectories(userAddress: string, supplierAddress: string, timeoutMs: number, supplierCache?: SupplierCache) {
  const user = createUserClient(userAddress, { timeoutMs });
  const supplier = createSupplierClient(supplierAddress, { timeoutMs });
  const suppliers = createSupplierLookup(supplier, supplierCache);
  return {
    getRequester: (userId: string) => user.getPublicProfile({ userId }),
    // Redis first, then Supplier gRPC; Redis failures fall through to gRPC.
    getSupplier: suppliers.getSupplier,
    // Always Supplier gRPC; the supplier-event consumer refreshes the cache with it.
    fetchSupplier: suppliers.fetchSupplier,
    close: () => { user.close(); supplier.close(); },
  };
}
