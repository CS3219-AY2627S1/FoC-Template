// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — let /api/ requests through without a session cookie so relay routes answer a JSON 401 instead of redirecting (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME, SESSION_EXPIRED_PATH } from '@/lib/auth';

const PUBLIC_PATHS = new Set(['/', '/signup']);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Clears the cookie itself, with or without one, so never redirect it.
  if (pathname === SESSION_EXPIRED_PATH) return NextResponse.next();
  // API routes answer a missing session with a JSON 401, not a login page.
  if (pathname.startsWith('/api/')) return NextResponse.next();

  const isAuthenticated = request.cookies.has(SESSION_COOKIE_NAME);
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isPublicPath) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets/image optimizer output.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
