import { beforeEach, describe, expect, it, vi } from 'vitest';

import { login, signup } from '@/lib/auth-actions';
import { setSessionCookie } from '@/lib/session';
import { UserServiceError, userService } from '@/lib/user-service';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/session', () => ({
  clearSessionCookie: vi.fn(),
  getSessionToken: vi.fn(),
  requireCurrentUser: vi.fn(),
  setSessionCookie: vi.fn(),
}));
vi.mock('@/lib/user-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/user-service')>();
  return {
    ...actual,
    userService: { createUser: vi.fn(), login: vi.fn() },
  };
});

const NEW_USER = {
  nus_student_number: 'A1234567B',
  email: 'tx@u.nus.edu',
  display_name: 'Tze Xuan',
  password: 'secret1!',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('signup', () => {
  it('creates the account, then logs in and sets the cookie', async () => {
    vi.mocked(userService.login).mockResolvedValue({
      access_token: 'token',
    } as never);

    await expect(signup(NEW_USER)).resolves.toEqual({ ok: true });
    expect(userService.createUser).toHaveBeenCalledWith(NEW_USER);
    expect(setSessionCookie).toHaveBeenCalledWith('token');
  });

  it('explains a duplicate account', async () => {
    vi.mocked(userService.createUser).mockRejectedValue(
      new UserServiceError(409, 'Unable to create account'),
    );

    await expect(signup(NEW_USER)).resolves.toMatchObject({
      ok: false,
      status: 409,
      error: 'An account with this student number or email already exists.',
    });
    expect(userService.login).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('hides whether the account exists', async () => {
    vi.mocked(userService.login).mockRejectedValue(
      new UserServiceError(401, 'Invalid credentials'),
    );

    await expect(
      login({ nus_student_number: 'A1234567B', password: 'wrong' }),
    ).resolves.toMatchObject({
      ok: false,
      status: 401,
      error: 'Incorrect student number or password.',
    });
  });

  it('reports an outage without blaming the credentials', async () => {
    vi.mocked(userService.login).mockRejectedValue(
      new UserServiceError(503, 'User Service is unavailable.'),
    );

    await expect(
      login({ nus_student_number: 'A1234567B', password: 'secret1!' }),
    ).resolves.toMatchObject({ ok: false, status: 503 });
  });
});
