// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - HTTP-level fixtures (register, activate, login)
// Author review:
// 27/09/2026: Stage 9 - createUserWithRole, bearer
// Author review:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
//        `request(app)` supertest servers with the shared loopback server in
//        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
// Scope: Bug fix - registerPending now captures the `pendingToken` Set-Cookie from the register
//        response and carries it on the returned TestUser; createActiveUser attaches it (via
//        the new pendingCookie helper, mirroring refreshCookie) to its internal verify-otp call,
//        since that call now requires the cookie. Governing decision: bug report + team
//        decisions recorded in this task's conversation (pending-token cookie mechanism). No
//        requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import type request from 'supertest';
import { api } from './server.js';
import { getUserByEmail, setUserRole } from './db.js';
import { latestOtpFor } from './email.js';
import { PASSWORD } from './constants.js';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  pendingToken: string;
}

export function userInput(n: number | string = 1, password = PASSWORD) {
  return { username: `user${n}`, email: `user${n}@example.com`, password };
}

// Registers through the API and leaves the account pending.
export async function registerPending(
  n: number | string = 1,
  password = PASSWORD,
): Promise<TestUser> {
  const input = userInput(n, password);
  const res = await api().post('/auth/register').send(input);
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const row = (await getUserByEmail(input.email))!;
  const pendingToken = cookieValue(res, 'pendingToken')!;
  return { id: row.id, pendingToken, ...input };
}

// Registers and verifies the OTP, so the account is active.
export async function createActiveUser(
  n: number | string = 1,
  password = PASSWORD,
): Promise<TestUser> {
  const user = await registerPending(n, password);
  const res = await api()
    .post('/auth/verify-otp')
    .set('Cookie', pendingCookie(user.pendingToken))
    .send({ email: user.email, otp: latestOtpFor(user.email), purpose: 'registration' });
  if (res.status !== 200)
    throw new Error(`verify failed: ${res.status} ${JSON.stringify(res.body)}`);
  return user;
}

export async function loginUser(user: TestUser, password = user.password) {
  return api().post('/auth/login').send({ identifier: user.email, password });
}

// Logs in and returns the tokens plus the raw refresh cookie value.
export async function loginTokens(
  user: TestUser,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await loginUser(user);
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { accessToken: res.body.accessToken, refreshToken: cookieValue(res, 'refreshToken')! };
}

export function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = list.find((c) => c.startsWith(`${name}=`));
  return found?.split(';')[0]?.slice(name.length + 1);
}

export function refreshCookie(token: string): string {
  return `refreshToken=${token}`;
}

export function pendingCookie(token: string): string {
  return `pendingToken=${token}`;
}

// An active account with the given role, set directly in the DB (there is no API for it yet).
export async function createUserWithRole(
  n: number | string,
  role: 'user' | 'admin' | 'super admin',
): Promise<TestUser> {
  const user = await createActiveUser(n);
  if (role !== 'user') await setUserRole(user.id, role);
  return user;
}

// Access token for a user (logs in, so the role claim reflects the current DB role).
export async function accessTokenFor(user: TestUser): Promise<string> {
  return (await loginTokens(user)).accessToken;
}

export function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}
