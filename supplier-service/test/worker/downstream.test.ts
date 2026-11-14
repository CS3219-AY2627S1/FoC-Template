/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the logging mock Order/Message clients (Phase 4 plan Task 10). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: Rewritten for the HTTP Order client (team contract given in chat, 2026-11-11). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { createHttpOrderClient } from '../../src/worker/downstream.js';

describe('HTTP order client', () => {
  it('POSTs the supplier name with the service key to /suppliers/:id/cancel-orders', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cancelled: 2 }), { status: 200 }));
    await createHttpOrderClient('http://order-service:3000', 'k', fetchImpl).deleteUncollectedRequests(101, 'Campus Store');

    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('http://order-service:3000/suppliers/101/cancel-orders');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'order-supplier-service-key': 'k' });
    expect(JSON.parse(String(init.body))).toEqual({ supplierName: 'Campus Store' });
  });

  it.each([401, 400, 503])('rejects on a %i answer, so the job is retried', async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(
      createHttpOrderClient('http://order-service:3000', 'k', fetchImpl).deleteUncollectedRequests(101, 'S'),
    ).rejects.toThrow(String(status));
  });

  it('rejects when the call cannot be made', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      createHttpOrderClient('http://order-service:3000', 'k', fetchImpl).deleteUncollectedRequests(101, 'S'),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
