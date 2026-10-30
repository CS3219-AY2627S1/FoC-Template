/*
Event notification to order.supplier-events:
  SupplierUpdated        - supplier.updated
  SupplierStatusChanged  - supplier.status_changed
  SupplierDeleted        - supplier.deleted
*/

import type { SupplierDeleted, SupplierStatusChanged, SupplierUpdated } from '@foc/messaging';

export class SupplierMessagingProducer {
  async publishSupplierUpdated(_event: SupplierUpdated): Promise<void> {
    throw new Error('SupplierMessagingProducer.publishSupplierUpdated is not implemented yet');
  }

  async publishStatusChanged(_event: SupplierStatusChanged): Promise<void> {
    throw new Error('SupplierMessagingProducer.publishStatusChanged is not implemented yet');
  }

  async publishSupplierDeleted(_event: SupplierDeleted): Promise<void> {
    throw new Error('SupplierMessagingProducer.publishSupplierDeleted is not implemented yet');
  }
}
