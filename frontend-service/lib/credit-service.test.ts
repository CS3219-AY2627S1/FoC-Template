import { afterEach, describe, expect, it, vi } from 'vitest';

import { creditService } from '@/lib/credit-service';
import { ServiceError } from '@/lib/service-request';

function mockFetch(status: number, body: unknown) {
  // A fresh Response per call: a body can only be read once.
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status }),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMyBalance', () => {
  it('returns null when the user has no account yet', async () => {
    mockFetch(404, { detail: 'missing', code: 'CREDIT_ACCOUNT_NOT_FOUND' });
    await expect(creditService.getMyBalance('t')).resolves.toBeNull();
  });

  it('rethrows other failures', async () => {
    mockFetch(500, { detail: 'boom' });
    await expect(creditService.getMyBalance('t')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});

describe('listMyTransactions', () => {
  it('sends paging parameters only when given', async () => {
    const fetchMock = mockFetch(200, {
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    await creditService.listMyTransactions('t');
    await creditService.listMyTransactions('t', { limit: 20, offset: 40 });

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/credits\/me\/transactions$/);
    expect(fetchMock.mock.calls[1][0]).toMatch(
      /\/credits\/me\/transactions\?limit=20&offset=40$/,
    );
  });
});
