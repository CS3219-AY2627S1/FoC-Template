/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Order Service / Message Service ports and logging mock adapters (Phase 4 plan Task 10).
 *        The concrete request contracts are deferred (SupplierServiceArchitecture.md §9 items 5, 17);
 *        the method names and the logging-mock approach are the team's answer of 2026-09-30. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: Replaced the logging mocks with an HTTP Order Service client, per the team's contract given
 *        in chat on 2026-11-11: POST {ORDER_SERVICE_URL}/suppliers/:id/cancel-orders, JSON body
 *        { supplierName }, header order-supplier-service-key, 200 on success. The Message Service
 *        port is removed: order-service now sends the request-chat system message itself. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
/** Order Service delete entrypoint (F8.4.2): cancels requests for the supplier not yet collected. */
export interface OrderClient {
  deleteUncollectedRequests(supplierId: number, supplierName: string): Promise<void>;
}

export const ORDER_CALL_TIMEOUT_MS = 10_000;

/** A non-2xx answer or a network failure rejects, so BullMQ retries the job. */
export function createHttpOrderClient(
  baseUrl: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = ORDER_CALL_TIMEOUT_MS,
): OrderClient {
  return {
    async deleteUncollectedRequests(supplierId, supplierName) {
      const response = await fetchImpl(new URL(`/suppliers/${supplierId}/cancel-orders`, baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'order-supplier-service-key': serviceKey },
        body: JSON.stringify({ supplierName }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(`order-service answered ${response.status} to the cancel-orders call for supplier ${supplierId}`);
      }
    },
  };
}
