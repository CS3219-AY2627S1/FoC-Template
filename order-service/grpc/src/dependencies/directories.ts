// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Integrated approved shared Supplier validation and missing-location placeholder.
// Author review: Pending; see ../../../usage-log.md.

//AI assistance disclosure: ChatGPT (Codex), 2026-10-22.
//Scope:Formatting help to avoid messy try catch when integrating supplierId grpc call error

import {createUserClient,createSupplierClient, grpcsupplierSchema, isOpenResponseSchema,} from '@foc/grpc';

import {toSupplierRpcId} from './supplierErrorHelper';


export function createDirectories(userAddress: string, supplierAddress: string, timeoutMs: number) {
  const user = createUserClient(userAddress, { timeoutMs });
  const supplier = createSupplierClient(supplierAddress, { timeoutMs });
  return {
    getRequester: (userId: string) => user.getPublicProfile({ userId }),
    getSupplier: async (supplierId: string) => {
      const response = await supplier.getSupplier({
        supplierId: toSupplierRpcId(supplierId),
      });
      return {
        ...grpcsupplierSchema.parse(response),
        // Human-approved placeholder while Supplier no longer provides this field.
        locationDescription: response.locationDescription?.trim() ? response.locationDescription : '-',
      };
    },
    isSupplierOpen: async (supplierId: string) => {
      const response = await supplier.isOpen({
        supplierId: toSupplierRpcId(supplierId),
      });
      return isOpenResponseSchema.parse(response);
    },
    close: () => { user.close(); supplier.close(); },
  };
}
