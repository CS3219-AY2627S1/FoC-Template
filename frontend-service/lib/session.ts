import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRED_PATH,
  VIEW_COOKIE_NAME,
} from '@/lib/auth';
import { type User, UserServiceError, userService } from '@/lib/user-service';

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

/**
 * Secure unless `COOKIE_SECURE=false`, which Compose sets because it serves
 * plain http. Read from config, not `x-forwarded-proto`, because clients can
 * send that header themselves.
 */
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';

/**
 * Only callable from Server Actions and Route Handlers. There is no max-age:
 * User Service extends the session while it is used, so it decides when the
 * token expires and pages handle the resulting 401.
 */
export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
  });
}

/** Also leaves the admin view, so every new session starts as a user. */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  store.delete(VIEW_COOKIE_NAME);
}

/** Only callable from Server Actions and Route Handlers. */
export async function setAdminViewCookie(enabled: boolean) {
  const store = await cookies();
  if (!enabled) {
    store.delete(VIEW_COOKIE_NAME);
    return;
  }
  store.set(VIEW_COOKIE_NAME, 'admin', {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
  });
}

/**
 * The signed-in user for the current request, deduplicated across the layout
 * and page. A missing or rejected session redirects to the login page; a User
 * Service outage is rethrown so the error boundary shows it, because it does
 * not mean the user has logged out.
 */
export const requireCurrentUser = cache(async (): Promise<User> => {
  const token = await getSessionToken();
  if (!token) redirect('/');

  try {
    return await userService.getCurrentUser(token);
  } catch (error) {
    if (error instanceof UserServiceError && error.status === 401) {
      redirect(SESSION_EXPIRED_PATH);
    }
    throw error;
  }
});

/**
 * Whether the signed-in user is an administrator who switched to the admin
 * view. A stale cookie on an account that lost its admin role is ignored.
 */
export const isAdminView = cache(async (): Promise<boolean> => {
  const user = await requireCurrentUser();
  const view = (await cookies()).get(VIEW_COOKIE_NAME)?.value;
  return user.role === 'admin' && view === 'admin';
});

/**
 * Guards admin pages. Non-administrators get a 404 so the pages' existence
 * isn't advertised; an administrator in the user view goes back to the app.
 */
export async function requireAdminView(): Promise<User> {
  const user = await requireCurrentUser();
  if (user.role !== 'admin') notFound();
  if (!(await isAdminView())) redirect('/home');
  return user;
}
