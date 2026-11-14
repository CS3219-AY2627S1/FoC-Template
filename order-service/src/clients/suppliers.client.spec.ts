/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-23
 * Scope (2026-10-23): Unit tests for the supplier-service client - status mapping
 *        (200 found, 404 not_found, anything else / network / timeout unavailable), location
 *        membership, and the caller's token forwarded.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5): Stage 28 c2 - added tests for
 *        supplierStatusForWorker / locationExistsForWorker: the service-key header, closed/
 *        next-opening mapping, and an empty openingHours list treated as a failure. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { createHttpSuppliersClient } from './suppliers.client.js';

const BASE = 'http://supplier-service:3002';
const AUTH = 'Bearer abc';
const SERVICE_KEY = 'test-supplier-order-service-key';

const respond = (status: number, body: unknown = {}) =>
  vi.fn(
    async (_url: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );

describe('createHttpSuppliersClient', () => {
  it('GETs /api/v1/suppliers/:id with the caller token', async () => {
    const fetchImpl = respond(200, { supplier_id: 7 });
    const client = createHttpSuppliersClient(BASE, fetchImpl);
    await expect(client.supplierExists(7, AUTH)).resolves.toBe('found');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect((url as URL).href).toBe(`${BASE}/api/v1/suppliers/7`);
    expect(init?.headers).toMatchObject({ authorization: AUTH });
  });

  it.each([
    [404, 'not_found'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [429, 'unavailable'],
    [401, 'unavailable'],
    [403, 'unavailable'],
  ] as const)('supplier: HTTP %i -> %s', async (status, expected) => {
    const client = createHttpSuppliersClient(BASE, respond(status));
    await expect(client.supplierExists(7, AUTH)).resolves.toBe(expected);
  });

  it('network failure -> unavailable', async () => {
    const client = createHttpSuppliersClient(
      BASE,
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(client.supplierExists(7, AUTH)).resolves.toBe('unavailable');
    await expect(client.locationExists(1, AUTH)).resolves.toBe('unavailable');
  });

  it('a hung supplier-service times out -> unavailable', async () => {
    const hang = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const client = createHttpSuppliersClient(BASE, hang as typeof fetch, 20);
    await expect(client.supplierExists(7, AUTH)).resolves.toBe('unavailable');
  });

  it('location: membership in /reference/location', async () => {
    const fetchImpl = respond(200, {
      locations: [{ location_id: 1 }, { location_id: 12 }],
    });
    const client = createHttpSuppliersClient(BASE, fetchImpl);
    await expect(client.locationExists(12, AUTH)).resolves.toBe('found');
    await expect(client.locationExists(13, AUTH)).resolves.toBe('not_found');
    expect((fetchImpl.mock.calls[0]![0] as URL).href).toBe(
      `${BASE}/api/v1/suppliers/reference/location`,
    );
  });

  it.each([
    ['a 500', respond(500)],
    ['an unexpected body', respond(200, { nope: true })],
  ])('location: %s -> unavailable', async (_name, fetchImpl) => {
    const client = createHttpSuppliersClient(BASE, fetchImpl);
    await expect(client.locationExists(12, AUTH)).resolves.toBe('unavailable');
  });
});

describe('supplierStatusForWorker / locationExistsForWorker (service key)', () => {
  const NOW = new Date('2026-11-02T04:00:00Z'); // 2026-11-02 is a Monday; 12:00 SGT

  it('sends the service key header, not Authorization', async () => {
    const fetchImpl = respond(200, { openingHours: [{ day: 8, open: '00:00', close: '23:59' }] });
    const client = createHttpSuppliersClient(BASE, fetchImpl, 3_000, SERVICE_KEY);
    await client.supplierStatusForWorker(7, NOW);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect((url as URL).href).toBe(`${BASE}/api/v1/suppliers/7`);
    expect(init?.headers).toMatchObject({ 'supplier-order-service-key': SERVICE_KEY });
    expect(init?.headers).not.toHaveProperty('authorization');
  });

  it('throws if the service key was never configured', async () => {
    const client = createHttpSuppliersClient(BASE, respond(200, {}));
    await expect(client.supplierStatusForWorker(7, NOW)).rejects.toThrow(
      /SUPPLIER_ORDER_SERVICE_API_KEY/,
    );
  });

  it('not_found / unavailable map the same way as supplierExists', async () => {
    const notFound = createHttpSuppliersClient(BASE, respond(404), 3_000, SERVICE_KEY);
    await expect(notFound.supplierStatusForWorker(7, NOW)).resolves.toMatchObject({
      existence: 'not_found',
    });

    const down = createHttpSuppliersClient(BASE, respond(500), 3_000, SERVICE_KEY);
    await expect(down.supplierStatusForWorker(7, NOW)).resolves.toMatchObject({
      existence: 'unavailable',
    });
  });

  it('an empty openingHours list is reported as hasNoOpeningHours, not merely closed', async () => {
    const client = createHttpSuppliersClient(BASE, respond(200, { openingHours: [] }), 3_000, SERVICE_KEY);
    await expect(client.supplierStatusForWorker(7, NOW)).resolves.toEqual({
      existence: 'found',
      hasNoOpeningHours: true,
      closed: true,
      nextOpeningAt: null,
    });
  });

  it('a found supplier with hours maps to closed / nextOpeningAt via computeSupplierOpenStatus', async () => {
    // Monday 12:00 SGT, only open Tuesday 09:00-18:00 -> closed, next opening tomorrow 09:00.
    const client = createHttpSuppliersClient(
      BASE,
      respond(200, { openingHours: [{ day: 2, open: '09:00', close: '18:00' }] }),
      3_000,
      SERVICE_KEY,
    );
    const result = await client.supplierStatusForWorker(7, NOW);
    expect(result.existence).toBe('found');
    expect(result.hasNoOpeningHours).toBe(false);
    expect(result.closed).toBe(true);
    expect(result.nextOpeningAt).toEqual(new Date('2026-11-03T01:00:00Z')); // Tue 09:00 SGT
  });

  it('locationExistsForWorker uses the service key and the same membership check', async () => {
    const fetchImpl = respond(200, { locations: [{ location_id: 12 }] });
    const client = createHttpSuppliersClient(BASE, fetchImpl, 3_000, SERVICE_KEY);
    await expect(client.locationExistsForWorker(12)).resolves.toBe('found');
    await expect(client.locationExistsForWorker(13)).resolves.toBe('not_found');
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ 'supplier-order-service-key': SERVICE_KEY });
  });
});
