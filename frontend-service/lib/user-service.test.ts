import { afterEach, describe, expect, it, vi } from 'vitest';

import { UserServiceError, userService } from '@/lib/user-service';

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request bodies', () => {
  it('sends only credentials to /login', async () => {
    const fetchMock = mockFetch(200, { access_token: 't' });
    await userService.login({
      nus_student_number: 'A1234567B',
      password: 'secret1!',
      email: 'tx@u.nus.edu',
      display_name: 'Tze Xuan',
    } as never);

    expect(sentBody(fetchMock)).toEqual({
      nus_student_number: 'A1234567B',
      password: 'secret1!',
    });
  });

  it('sends only the known fields when creating a user', async () => {
    const fetchMock = mockFetch(201, {});
    await userService.createUser({
      nus_student_number: 'A1234567B',
      email: 'tx@u.nus.edu',
      display_name: 'Tze Xuan',
      password: 'secret1!',
      role: 'admin',
    } as never);

    expect(sentBody(fetchMock)).toEqual({
      nus_student_number: 'A1234567B',
      email: 'tx@u.nus.edu',
      display_name: 'Tze Xuan',
      password: 'secret1!',
    });
  });

  it('sends only the changed profile fields', async () => {
    const fetchMock = mockFetch(200, {});
    await userService.updateCurrentUser('t', {
      display_name: 'Tze Xuan',
      role: 'admin',
    } as never);

    expect(sentBody(fetchMock)).toEqual({ display_name: 'Tze Xuan' });
  });
});

describe('admin routes', () => {
  it('lists users with only the filters given', async () => {
    const fetchMock = mockFetch(200, { items: [], total: 0 });
    await userService.listUsers('t', { q: 'alice', status: 'suspended' });

    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/admin\/users\?q=alice&status=suspended$/,
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
  });

  it('posts suspension and reinstatement to the escaped user path', async () => {
    const fetchMock = mockFetch(200, {});
    await userService.suspendUser('t', 'a/b');
    await userService.unsuspendUser('t', 'abc');

    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/admin\/users\/a%2Fb\/suspend$/,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(fetchMock.mock.calls[1][0]).toMatch(
      /\/admin\/users\/abc\/unsuspend$/,
    );
  });

  it('posts promotion to the grant-admin path', async () => {
    const fetchMock = mockFetch(200, {});
    await userService.grantAdmin('t', 'abc');

    expect(fetchMock.mock.calls[0][0]).toMatch(
      /\/admin\/users\/abc\/grant-admin$/,
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
});

describe('errors', () => {
  it('maps FastAPI validation errors to field errors', async () => {
    mockFetch(422, {
      detail: [
        { loc: ['body', 'email'], msg: 'value is not a valid email address' },
        {
          loc: ['body', 'display_name'],
          msg: 'Value error, display_name contains unsupported characters',
        },
      ],
    });

    const error = await userService
      .createUser({
        nus_student_number: 'A1234567B',
        email: 'bad',
        display_name: 'X1',
        password: 'secret1!',
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UserServiceError);
    expect(error).toMatchObject({
      status: 422,
      fieldErrors: {
        email: 'value is not a valid email address',
        display_name: 'display_name contains unsupported characters',
      },
    });
  });

  it('keeps a plain detail message', async () => {
    mockFetch(409, { detail: 'Unable to create account' });

    await expect(userService.getCurrentUser('t')).rejects.toMatchObject({
      status: 409,
      message: 'Unable to create account',
    });
  });

  it('reports a connection failure as 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch')));

    await expect(userService.getCurrentUser('t')).rejects.toMatchObject({
      status: 503,
    });
  });
});
