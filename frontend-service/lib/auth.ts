/**
 * Name of the httpOnly cookie holding the User Service bearer token. It is
 * written only by Server Actions in `lib/session.ts`. `proxy.ts` checks for
 * its presence to decide whether a request is authenticated. It never
 * inspects the value: User Service validates it when the app loads a page.
 */
export const SESSION_COOKIE_NAME = 'foc_session';

/**
 * Set to `admin` while an administrator uses the admin view, toggled from
 * the profile page. It only chooses which pages and navigation to show: the
 * services check the role on every admin request, and `lib/session.ts`
 * ignores the cookie for anyone who isn't an administrator.
 */
export const VIEW_COOKIE_NAME = 'foc_view';

/**
 * Route that clears a session User Service has rejected. Pages can't modify
 * cookies while rendering, so they redirect here instead.
 */
export const SESSION_EXPIRED_PATH = '/auth/expired';

const REDIRECT_BASE = 'http://foc.invalid';

/**
 * Only follow same-origin paths from `?from=`. Resolving with `URL` applies
 * the browser's own parsing, which reads `/\evil.com` or `/<tab>/evil.com`
 * as another host even though they start with a single `/`.
 */
export function safeRedirectPath(from: string | null | undefined) {
  if (!from?.startsWith('/')) return '/home';
  const url = new URL(from, REDIRECT_BASE);
  return url.origin === REDIRECT_BASE
    ? `${url.pathname}${url.search}${url.hash}`
    : '/home';
}
