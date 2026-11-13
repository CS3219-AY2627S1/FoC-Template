// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — unit tests for the relay: token forwarding, status pass-through, missing cookie, unreachable service, stream headers and body, Last-Event-ID, JSON errors before the stream, and query filtering (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forwardQuery, relayJson, relayStream } from '@/lib/notification-relay';

const BASE = 'http://notifications.test';

function browserRequest(
  path: string,
  { cookie = 'foc_session=tok', headers = {} as Record<string, string> } = {},
) {
  return new Request(`http://app.test${path}`, {
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}

function mockFetch(response: () => Response | Promise<Response>) {
  const fetchMock = vi.fn().mockImplementation(async () => response());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv('NOTIFICATION_SERVICE_URL', BASE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('relayJson', () => {
  it('forwards the session cookie as a bearer token', async () => {
    const fetchMock = mockFetch(() => Response.json({ count: 3 }));
    const response = await relayJson(
      browserRequest('/api/notifications/unread-count'),
      '/notifications/unread-count',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 3 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/notifications/unread-count`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('decodes the cookie value', async () => {
    const fetchMock = mockFetch(() => Response.json({}));
    await relayJson(
      browserRequest('/x', { cookie: 'a=1; foc_session=a%2Bb%3D; b=2' }),
      '/notifications/read-all',
      'POST',
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer a+b=',
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it.each([401, 404, 422, 503])(
    'passes a %i through unchanged',
    async (status) => {
      mockFetch(
        () =>
          new Response(JSON.stringify({ detail: `upstream ${status}` }), {
            status,
            headers: {
              'Content-Type': 'application/json',
              ...(status === 401 && { 'WWW-Authenticate': 'Bearer' }),
            },
          }),
      );
      const response = await relayJson(browserRequest('/x'), '/notifications');

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({
        detail: `upstream ${status}`,
      });
      expect(response.headers.get('WWW-Authenticate')).toBe(
        status === 401 ? 'Bearer' : null,
      );
    },
  );

  it('answers 401 without calling the service when there is no cookie', async () => {
    const fetchMock = mockFetch(() => Response.json({}));
    const response = await relayJson(
      browserRequest('/x', { cookie: '' }),
      '/notifications',
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 when the service is unreachable', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    const response = await relayJson(browserRequest('/x'), '/notifications');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: 'Notification Service is unavailable.',
    });
  });
});

describe('relayStream', () => {
  it('pipes the event stream with the SSE headers', async () => {
    const events = 'id: 7\ndata: {"id":7}\n\n: ping\n\n';
    const fetchMock = mockFetch(
      () =>
        new Response(events, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    );
    const request = browserRequest('/api/notifications/stream', {
      headers: { 'Last-Event-ID': '6' },
    });
    const response = await relayStream(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe(
      'no-cache, no-transform',
    );
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
    await expect(response.text()).resolves.toBe(events);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/notifications/stream`);
    expect(init.headers['Last-Event-ID']).toBe('6');
    expect(init.headers.Authorization).toBe('Bearer tok');
    // Aborting the browser's request aborts the upstream one.
    expect(init.signal).toBe(request.signal);
  });

  it('omits Last-Event-ID when the browser sent none', async () => {
    const fetchMock = mockFetch(
      () =>
        new Response('', { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    await relayStream(browserRequest('/api/notifications/stream'));
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      'Last-Event-ID',
    );
  });

  it('passes a JSON error through instead of streaming it', async () => {
    mockFetch(() =>
      Response.json({ detail: 'User Service unavailable' }, { status: 503 }),
    );
    const response = await relayStream(browserRequest('/x'));

    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toMatch(/application\/json/);
    await expect(response.json()).resolves.toEqual({
      detail: 'User Service unavailable',
    });
  });

  it('answers 503 when the service is unreachable', async () => {
    mockFetch(() => {
      throw new TypeError('fetch failed');
    });
    const response = await relayStream(browserRequest('/x'));
    expect(response.status).toBe(503);
  });
});

describe('forwardQuery', () => {
  it('keeps only the named parameters', () => {
    const request = browserRequest(
      '/api/notifications?cursor=40&limit=20&user_id=9',
    );
    expect(forwardQuery(request, '/notifications', ['cursor', 'limit'])).toBe(
      '/notifications?cursor=40&limit=20',
    );
  });

  it('forwards values as given, even invalid ones', () => {
    const request = browserRequest('/api/notifications?cursor=abc');
    expect(forwardQuery(request, '/notifications', ['cursor', 'limit'])).toBe(
      '/notifications?cursor=abc',
    );
  });

  it('leaves the path bare without parameters', () => {
    expect(
      forwardQuery(browserRequest('/api/notifications'), '/notifications', [
        'cursor',
      ]),
    ).toBe('/notifications');
  });
});
