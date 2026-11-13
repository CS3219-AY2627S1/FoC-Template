/*
 - New order created / order edited --> send event for order fulfillment
 - Order canceled or order credits edited --> send request for credit refund
*/

import type {
  CreditReleaseCommand,
  OrderCreated,
  OrderCreditsEdited,
  OrderUpdated,
} from '@foc/messaging';

export class OrderMessagingProducer {
  async publishOrderCreated(_event: OrderCreated): Promise<void> {
    throw new Error('OrderMessagingProducer.publishOrderCreated is not implemented yet');
  }

  async publishOrderUpdated(_event: OrderUpdated): Promise<void> {
    throw new Error('OrderMessagingProducer.publishOrderUpdated is not implemented yet');
  }

  async publishCreditRefund(_command: CreditReleaseCommand): Promise<void> {
    throw new Error('OrderMessagingProducer.publishCreditRefund is not implemented yet');
  }

  async publishCreditsEdited(_event: OrderCreditsEdited): Promise<void> {
    throw new Error('OrderMessagingProducer.publishCreditsEdited is not implemented yet');
  }
}
