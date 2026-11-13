'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  clearSessionCookie,
  getSessionToken,
  requireCurrentUser,
  setSessionCookie,
} from '@/lib/session';
import {
  type Credentials,
  type FieldErrors,
  type UserCreate,
  type UserUpdate,
  UserServiceError,
  userService,
} from '@/lib/user-service';

export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** User Service's status code, when it answered at all. */
      status?: number;
      fieldErrors?: FieldErrors;
    };

const UNAVAILABLE = 'FoC is having trouble reaching its servers. Try again.';
const INVALID_LOGIN = 'Incorrect student number or password.';

/** Turns a User Service error into a form-level message plus field errors. */
function failure(
  error: unknown,
  messages: Partial<Record<number, string>> = {},
): ActionResult {
  if (!(error instanceof UserServiceError)) throw error;
  if (error.status >= 500) {
    return { ok: false, error: UNAVAILABLE, status: error.status };
  }
  return {
    ok: false,
    error: messages[error.status] ?? error.message,
    status: error.status,
    fieldErrors: error.fieldErrors,
  };
}

async function startSession(credentials: Credentials) {
  const { access_token } = await userService.login(credentials);
  await setSessionCookie(access_token);
}

export async function login(credentials: Credentials): Promise<ActionResult> {
  try {
    await startSession(credentials);
    return { ok: true };
  } catch (error) {
    // User Service gives one 401 for wrong credentials and inactive accounts
    // so it doesn't reveal which accounts exist. A bad student number is a
    // 422, which would reveal nothing either.
    return failure(error, { 401: INVALID_LOGIN, 422: INVALID_LOGIN });
  }
}

export async function signup(user: UserCreate): Promise<ActionResult> {
  try {
    await userService.createUser(user);
  } catch (error) {
    return failure(error, {
      409: 'An account with this student number or email already exists.',
    });
  }

  try {
    await startSession(user);
    return { ok: true };
  } catch (error) {
    return failure(error, {
      401: 'Your account was created, but logging in failed. Log in to continue.',
    });
  }
}

export async function logout() {
  const token = await getSessionToken();
  if (token) {
    try {
      await userService.logout(token);
    } catch {
      // The session may already be gone; either way the cookie is cleared.
    }
  }
  await clearSessionCookie();
  redirect('/');
}

export async function updateProfile(
  changes: UserUpdate,
): Promise<ActionResult> {
  const token = await getSessionToken();
  if (!token) redirect('/');
  const user = await requireCurrentUser();

  try {
    await userService.updateCurrentUser(token, changes);
  } catch (error) {
    return failure(error, {
      401: 'Your session has expired. Log in again.',
      409: 'That email address is already in use.',
    });
  }

  if (changes.password) {
    // A password change revokes every session, including this one.
    try {
      await startSession({
        nus_student_number: user.nus_student_number,
        password: changes.password,
      });
    } catch {
      await clearSessionCookie();
      redirect('/');
    }
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deactivateAccount(): Promise<ActionResult> {
  const token = await getSessionToken();
  if (!token) redirect('/');

  try {
    await userService.deactivateCurrentUser(token);
  } catch (error) {
    return failure(error, {
      409: 'You are the last administrator, so this account cannot be deactivated.',
    });
  }

  await clearSessionCookie();
  redirect('/?notice=deactivated');
}
