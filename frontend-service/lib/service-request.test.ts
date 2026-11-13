import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ServiceError,
  createServiceRequest,
  withQuery,
} from '@/lib/service-request';

const request = createServiceRequest('http://svc', 'Test Service');

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        body === undefined
          ? null
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
        { status },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function failure(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ServiceError);
  return error as ServiceError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createServiceRequest', () => {
  it('sends the bearer token and JSON body', async () => {
    const fetchMock = mockFetch(200, { id: 1 });
    await expect(
      request('/things', { method: 'POST', token: 't', body: { a: 1 } }),
    ).resolves.toEqual({ id: 1 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://svc/things');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer t',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
  });

  it('rejects a missing token as an expired session without calling out', async () => {
    const fetchMock = mockFetch(200, {});
    const error = await failure(request('/things', { token: undefined }));
    expect(error.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('replaces any 401 detail with the session message', async () => {
    mockFetch(401, { detail: 'Invalid token' });
    const error = await failure(request('/things', { token: 't' }));
    expect(error.message).toBe(
      'Your session has expired. Please log in again.',
    );
  });

  it('uses a string detail and passes the error code through', async () => {
    mockFetch(404, { detail: 'No account', code: 'CREDIT_ACCOUNT_NOT_FOUND' });
    const error = await failure(request('/things', { token: 't' }));
    expect(error).toMatchObject({
      status: 404,
      message: 'No account',
      code: 'CREDIT_ACCOUNT_NOT_FOUND',
    });
  });

  it('formats the first FastAPI validation issue with its field', async () => {
    mockFetch(422, {
      detail: [
        { loc: ['body', 'credit_amount'], msg: 'Value error, too large' },
      ],
    });
    const error = await failure(request('/things', { token: 't' }));
    expect(error.message).toBe('credit_amount: too large');
  });

  it('falls back to a generic message for a non-JSON body', async () => {
    mockFetch(502, '<html>Bad Gateway</html>');
    const error = await failure(request('/things', { token: 't' }));
    expect(error).toMatchObject({
      status: 502,
      message: 'Test Service request failed.',
    });
  });

  it('rejects an empty or non-JSON success body', async () => {
    mockFetch(200);
    const error = await failure(request('/things', { token: 't' }));
    expect(error).toMatchObject({
      status: 502,
      message: 'Test Service sent an invalid response.',
    });
  });

  it('reports a network failure as the service being unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    const error = await failure(request('/things', { token: 't' }));
    expect(error).toMatchObject({
      status: 503,
      message: 'Test Service is unavailable.',
    });
  });
});

describe('withQuery', () => {
  it('keeps defined parameters in order and drops the rest', () => {
    expect(
      withQuery('/orders', { role: 'courier', limit: 20, offset: undefined }),
    ).toBe('/orders?role=courier&limit=20');
    expect(withQuery('/orders', {})).toBe('/orders');
  });
});
