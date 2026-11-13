/*
Consumes supplier catalogue events and credit reservation results.
*/

import type { CreditResult, QueueMessage, SupplierEvent } from '@foc/messaging';

export class OrderMessagingConsumer {
  async start(): Promise<void> {
    throw new Error('OrderMessagingConsumer.start is not implemented yet');
  }

  async handleSupplierEvent(_message: QueueMessage<SupplierEvent>): Promise<void> {
    throw new Error('OrderMessagingConsumer.handleSupplierEvent is not implemented yet');
  }

  async handleCreditResult(_message: QueueMessage<CreditResult>): Promise<void> {
    throw new Error('OrderMessagingConsumer.handleCreditResult is not implemented yet');
  }
}
