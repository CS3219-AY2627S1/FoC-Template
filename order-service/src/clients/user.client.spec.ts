/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 d (instructions.md) - unit tests for createHttpUserClient: the service-key
 *        header, status/lockedUntil mapping, not_found/unavailable mapping, network failure,
 *        and timeout. No requirements, architecture, schema, or API decisions were made by the
 *        AI tool.
 * Author review:
 */

import { createHttpUserClient } from './user.client.js';

const BASE = 'http://user-service:3001';
const SERVICE_KEY = 'test-user-order-service-key';

const respond = (status: number, body: unknown = {}) =>
  vi.fn(
    async (_url: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );

describe('createHttpUserClient', () => {
  it('GETs /users/worker/:id with the service key header, not Authorization', async () => {
    const fetchImpl = respond(200, { status: 'active', lockedUntil: null });
    const client = createHttpUserClient(BASE, SERVICE_KEY, fetchImpl);
    await client.statusForWorker('u-1');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect((url as URL).href).toBe(`${BASE}/users/worker/u-1`);
    expect(init?.headers).toMatchObject({ 'user-order-service-key': SERVICE_KEY });
    expect(init?.headers).not.toHaveProperty('authorization');
  });

  it('maps an active user with no lock', async () => {
    const client = createHttpUserClient(
      BASE,
      SERVICE_KEY,
      respond(200, { status: 'active', lockedUntil: null }),
    );
    await expect(client.statusForWorker('u-1')).resolves.toEqual({
      existence: 'found',
      status: 'active',
      lockedUntil: null,
    });
  });

  it.each(['pending', 'suspended'] as const)('maps a %s user', async (status) => {
    const client = createHttpUserClient(BASE, SERVICE_KEY, respond(200, { status, lockedUntil: null }));
    await expect(client.statusForWorker('u-1')).resolves.toEqual({
      existence: 'found',
      status,
      lockedUntil: null,
    });
  });

  it('maps a locked user to a Date', async () => {
    const lockedUntil = '2026-11-10T00:00:00.000Z';
    const client = createHttpUserClient(BASE, SERVICE_KEY, respond(200, { status: 'active', lockedUntil }));
    const result = await client.statusForWorker('u-1');
    expect(result.existence).toBe('found');
    expect(result.lockedUntil).toEqual(new Date(lockedUntil));
  });

  it('HTTP 404 -> not_found', async () => {
    const client = createHttpUserClient(BASE, SERVICE_KEY, respond(404));
    await expect(client.statusForWorker('u-1')).resolves.toEqual({
      existence: 'not_found',
      status: null,
      lockedUntil: null,
    });
  });

  it.each([401, 429, 500, 503])('HTTP %i -> unavailable', async (status) => {
    const client = createHttpUserClient(BASE, SERVICE_KEY, respond(status));
    await expect(client.statusForWorker('u-1')).resolves.toEqual({
      existence: 'unavailable',
      status: null,
      lockedUntil: null,
    });
  });

  it('an unexpected body -> unavailable', async () => {
    const client = createHttpUserClient(BASE, SERVICE_KEY, respond(200, { nope: true }));
    await expect(client.statusForWorker('u-1')).resolves.toMatchObject({ existence: 'unavailable' });
  });

  it('network failure -> unavailable', async () => {
    const client = createHttpUserClient(
      BASE,
      SERVICE_KEY,
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(client.statusForWorker('u-1')).resolves.toMatchObject({ existence: 'unavailable' });
  });

  it('a hung user-service times out -> unavailable', async () => {
    const hang = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const client = createHttpUserClient(BASE, SERVICE_KEY, hang as typeof fetch, 20);
    await expect(client.statusForWorker('u-1')).resolves.toMatchObject({ existence: 'unavailable' });
  });
});
