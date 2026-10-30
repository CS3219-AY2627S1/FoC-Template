import type { Channel } from "amqplib";

export const EXCHANGES = {
  order: 'order.events',
  credit: 'credit.events',
  supplier: 'supplier.events',
  user: 'user.events',
  dead_letter: 'dlx.events', //subject to specific implementation
  retry: 'retry.events' //subject to specific implementation
} as const;

export const CREDIT_USER_QUEUE = 'credit.user-events';

export const QUEUES = {
  creditUser: CREDIT_USER_QUEUE,
  orderUser: "order.user-events",
  orderSupplier: "order.supplier-events",
  notificationOrders: "notification.order-events",
  uiSupplier: "ui-gateway.supplier-events",
  uiCredit: "ui-gateway.credit-events",
  uiOrder: "ui-gateway.order-events",
} as const;

export const ROUTING_KEYS = {
  userDeleted: "user.deleted",
  userRestored: "user.restored",
  supplierUpdated: "supplier.updated",
  supplierHoursChanged: "supplier.hours.changed",
  creditPaymentCompleted: "credit.payment.completed",
  creditBalanceUpdated: "credit.balance.updated",
  orderAccepted: "order.accepted",
  orderPickedUp: "order.picked_up",
  orderDelivered: "order.delivered",
  orderCancelled: "order.cancelled",
} as const;

const BINDINGS: [string, string, string][] = [
  [QUEUES.creditUser, EXCHANGES.user, "user.*"],
  [QUEUES.orderUser, EXCHANGES.user, "user.*"],
  [QUEUES.orderSupplier, EXCHANGES.supplier, ROUTING_KEYS.supplierHoursChanged],
  [QUEUES.orderSupplier, EXCHANGES.supplier, ROUTING_KEYS.supplierUpdated],
  [QUEUES.notificationOrders, EXCHANGES.order, "order.*"],
  [QUEUES.uiSupplier, EXCHANGES.supplier, "supplier.#"],
  [QUEUES.uiCredit, EXCHANGES.credit, ROUTING_KEYS.creditBalanceUpdated],
  [QUEUES.uiOrder, EXCHANGES.order, "order.*"],
];

export const MAX_RETRIES = 3;
export const RETRY_HEADER = 'x-retry';

export function deadLetterExchange(queue: string): string {
  return `${queue}.dlx`;
}

export function deadLetterQueue(queue: string): string {
  return `${queue}.dlq`;
}

//suggested to combine bindings with queue 
export async function setupTopology(ch: Channel) {
  for (const ex of Object.values(EXCHANGES)) {
    await ch.assertExchange(ex, "topic", { durable: true });
  }
  for (const q of Object.values(QUEUES)) {
    await ch.assertQueue(q, { durable: true });
  }
  for (const [queue, exchange, key] of BINDINGS) {
    await ch.bindQueue(queue, exchange, key);
  }
}
