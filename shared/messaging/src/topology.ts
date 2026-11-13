// AI Assistance Disclosure: Claude Opus (Cursor), 2026-11-05.
// Prompt: improve index.ts to ensure supplier/order pub-sub works for the supplier cache.
// Scope: supplier.updated/supplier.deleted bindings, BINDINGS lookups; queue/key removals by the author.
// Author review: Pending.
export const EXCHANGES = {
  order: 'order.events',
 
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
 
 

} as const;

export const ROUTING_KEYS = {
  userDeleted: "user.deleted",
  userRestored: "user.restored",
  supplierUpdated: "supplier.updated",
  supplierDeleted: "supplier.deleted",

} as const;

export type Binding = { queue: string; exchange: string; routingKey: string };

export const BINDINGS: readonly Binding[] = [
  { queue: QUEUES.creditUser, exchange: EXCHANGES.user, routingKey: "user.*" },
  { queue: QUEUES.orderUser, exchange: EXCHANGES.user, routingKey: "user.*" },
  { queue: QUEUES.orderSupplier, exchange: EXCHANGES.supplier, routingKey: ROUTING_KEYS.supplierUpdated },
  { queue: QUEUES.orderSupplier, exchange: EXCHANGES.supplier, routingKey: ROUTING_KEYS.supplierDeleted },
];

export function bindingsForQueue(queue: string): Binding[] {
  return BINDINGS.filter((binding) => binding.queue === queue);
}

export function bindingsForExchange(exchange: string): Binding[] {
  return BINDINGS.filter((binding) => binding.exchange === exchange);
}

export const MAX_RETRIES = 3;
export const RETRY_HEADER = 'x-retry';

export function deadLetterExchange(queue: string): string {
  return `${queue}.dlx`;
}

export function deadLetterQueue(queue: string): string {
  return `${queue}.dlq`;
}
