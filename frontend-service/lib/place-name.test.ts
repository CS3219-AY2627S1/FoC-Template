import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { placeNameAt, placeNameOf } from '@/lib/place-name';

function mockFetch(response: Promise<Response>) {
  const fetchMock = vi.fn().mockReturnValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

let now = Date.parse('2026-10-29T00:00:00Z');

beforeEach(() => {
  // Each test starts past the previous lookup's one-second slot.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime((now += 5000));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('placeNameOf', () => {
  it('reads a trimmed name and ignores blank or missing ones', () => {
    expect(placeNameOf({ name: '  COM1 ' })).toBe('COM1');
    expect(placeNameOf({ name: '' })).toBeNull();
    expect(placeNameOf({})).toBeNull();
    expect(placeNameOf(null)).toBeNull();
    expect(placeNameOf({ name: 'x'.repeat(300) })).toHaveLength(200);
  });
});

describe('placeNameAt', () => {
  const com1 = { latitude: 1.2949, longitude: 103.7737 };

  it('asks Nominatim with a User-Agent, then answers from cache', async () => {
    const fetchMock = mockFetch(json({ name: 'COM1' }));
    await expect(placeNameAt(com1)).resolves.toBe('COM1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('lat=1.2949');
    expect(String(url)).toContain('lon=103.7737');
    expect(init.headers['User-Agent']).toBeTruthy();

    // Within ~10 m of a cached pin.
    await expect(
      placeNameAt({ latitude: 1.29491, longitude: 103.77372 }),
    ).resolves.toBe('COM1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not look up pins off campus', async () => {
    const fetchMock = mockFetch(json({ name: 'Elsewhere' }));
    await expect(
      placeNameAt({ latitude: 1.35, longitude: 103.82 }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the lookup fails', async () => {
    mockFetch(Promise.reject(new Error('offline')));
    await expect(
      placeNameAt({ latitude: 1.3, longitude: 103.77 }),
    ).resolves.toBeNull();
  });
});
