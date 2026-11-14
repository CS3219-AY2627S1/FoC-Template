/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issue #4 - unit tests for the HTTP credit client: request shape per
 *        credit-service/API.md and George's outcome classification (already-done
 *        codes = success; 5xx / network = transient; other 4xx = permanent).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 */

import { createHttpCreditsClient } from './credits.client.js';

const BASE = 'http://credit-service:3003';
const RESERVE = { userId: 'u-1', requestId: 'o-1', amount: 4 };

function respond(status: number, body?: unknown) {
  return vi.fn(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

const errorBody = (code: string) => ({ error: { code, message: 'x' } });

describe('createHttpCreditsClient: reserve', () => {
  it('POSTs the API.md body to /credits/reserve', async () => {
    const fetchImpl = respond(201, { balance: {} });
    await createHttpCreditsClient(BASE, fetchImpl).reserve(RESERVE);

    expect(fetchImpl).toHaveBeenCalledWith(new URL('/credits/reserve', BASE), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(RESERVE),
    });
  });

  it('treats 201 as success', async () => {
    await expect(
      createHttpCreditsClient(BASE, respond(201, {})).reserve(RESERVE),
    ).resolves.toEqual({ ok: true });
  });

  it('treats 409 RESERVATION_ALREADY_EXISTS as success (idempotent repeat)', async () => {
    const fetchImpl = respond(409, errorBody('RESERVATION_ALREADY_EXISTS'));
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).reserve(RESERVE),
    ).resolves.toEqual({ ok: true });
  });

  it.each([
    [422, 'INSUFFICIENT_UNRESERVED_CREDITS'],
    [404, 'BALANCE_NOT_FOUND'],
    [400, 'INVALID_REQUEST_BODY'],
  ])('treats %i %s as permanent', async (status, code) => {
    const fetchImpl = respond(status, errorBody(code));
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).reserve(RESERVE),
    ).resolves.toEqual({ ok: false, kind: 'permanent', status, code });
  });

  it('treats a 5xx as transient', async () => {
    const fetchImpl = respond(500, errorBody('INTERNAL_ERROR'));
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).reserve(RESERVE),
    ).resolves.toEqual({
      ok: false,
      kind: 'transient',
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });

  it('treats a connection failure as transient', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).reserve(RESERVE),
    ).resolves.toEqual({ ok: false, kind: 'transient', code: 'fetch failed' });
  });

  it('falls back to HTTP_<status> when the body is not the error envelope', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('Bad Gateway', { status: 502 }),
    );
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).reserve(RESERVE),
    ).resolves.toEqual({
      ok: false,
      kind: 'transient',
      status: 502,
      code: 'HTTP_502',
    });
  });
});

describe('createHttpCreditsClient: release', () => {
  it('POSTs { requestId } to /credits/release', async () => {
    const fetchImpl = respond(201, {});
    await createHttpCreditsClient(BASE, fetchImpl).release({
      requestId: 'o-1',
    });

    expect(fetchImpl).toHaveBeenCalledWith(new URL('/credits/release', BASE), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: 'o-1' }),
    });
  });

  it.each([
    [404, 'RESERVATION_NOT_FOUND'],
    [409, 'ALREADY_RELEASED'],
  ])('treats %i %s as success', async (status, code) => {
    const fetchImpl = respond(status, errorBody(code));
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).release({ requestId: 'o-1' }),
    ).resolves.toEqual({ ok: true });
  });

  it('treats 409 ALREADY_TRANSFERRED as permanent', async () => {
    const fetchImpl = respond(409, errorBody('ALREADY_TRANSFERRED'));
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).release({ requestId: 'o-1' }),
    ).resolves.toEqual({
      ok: false,
      kind: 'permanent',
      status: 409,
      code: 'ALREADY_TRANSFERRED',
    });
  });

  it('does not treat a reserve-only code as success on release', async () => {
    const fetchImpl = respond(409, errorBody('RESERVATION_ALREADY_EXISTS'));
    await expect(
      createHttpCreditsClient(BASE, fetchImpl).release({ requestId: 'o-1' }),
    ).resolves.toMatchObject({ ok: false, kind: 'permanent' });
  });
});
