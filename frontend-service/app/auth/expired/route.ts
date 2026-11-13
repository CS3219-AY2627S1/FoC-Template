import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, VIEW_COOKIE_NAME } from '@/lib/auth';
import { UserServiceError, userService } from '@/lib/user-service';

/**
 * A relative Location, because in the standalone server `request.url` has
 * the bind address (`0.0.0.0:3000`), not the host the browser used.
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

/**
 * Clears a session User Service rejected, then returns to the login page.
 * Any site can link here, so the cookie is only cleared once User Service
 * confirms the token is no longer valid.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    try {
      await userService.getCurrentUser(token);
      return redirectTo('/home');
    } catch (error) {
      if (!(error instanceof UserServiceError && error.status === 401)) {
        throw error;
      }
    }
  }

  const response = redirectTo('/?notice=expired');
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(VIEW_COOKIE_NAME);
  return response;
}
