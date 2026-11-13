// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-11
// Scope: Writing implementation code — the server-side relay to Notification Service: cookie-to-bearer forwarding, status and JSON pass-through, the local 401 and 503 answers, the unbuffered SSE stream pipe with Last-Event-ID and abort forwarding, and query filtering, following the Notification Service README handover contract (ai-20261111-001).
// Author review: Not confirmed (pending).
// Details: frontend-service/ai/usage-log.md; ai-20261111-001

/**
 * Server-side relay to Notification Service for the `/api/notifications`
 * Route Handlers. The browser can't call Notification Service itself: it is
 * published only on the host's loopback interface, and the session token
 * stays in the httpOnly `foc_session` cookie. Each relay route reads the
 * cookie, sends it as `Authorization: Bearer`, and passes the upstream status
 * and JSON body back unchanged.
 */

import 'server-only';

import { SESSION_COOKIE_NAME } from '@/lib/auth';
import { notificationServiceUrl as baseUrl } from '@/lib/notification-service';

const TIMEOUT_MS = 5000;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  // `no-transform` also stops Next's gzip from buffering the stream.
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

function json(status: number, body: unknown, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

function unavailable() {
  return json(503, { detail: 'Notification Service is unavailable.' });
}

/**
 * Without a cookie there is nothing to forward, so answer the 401
 * Notification Service would give, without calling it.
 */
function unauthenticated() {
  return json(
    401,
    { detail: 'Not authenticated.' },
    { 'WWW-Authenticate': 'Bearer' },
  );
}

/** Copies an upstream error or JSON response, keeping status and body. */
async function passThrough(upstream: Response) {
  const headers = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    'Cache-Control': 'no-store',
  });
  const challenge = upstream.headers.get('WWW-Authenticate');
  if (challenge) headers.set('WWW-Authenticate', challenge);
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers,
  });
}

function sessionToken(request: Request) {
  // Route Handlers get a NextRequest, but a plain Request keeps this testable.
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(value.join('=')) || undefined;
    }
  }
  return undefined;
}

/**
 * Forwards one JSON request. `path` already includes any query string the
 * caller chose to forward.
 */
export async function relayJson(
  request: Request,
  path: string,
  method: 'GET' | 'POST' = 'GET',
) {
  const token = sessionToken(request);
  if (!token) return unauthenticated();

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return unavailable();
  }
  try {
    return await passThrough(upstream);
  } catch {
    // The connection dropped while the body was being read.
    return unavailable();
  }
}

/**
 * Forwards the live stream. The body is piped through as it arrives so each
 * event and `: ping` reaches the browser at once. There is no timeout:
 * Notification Service ends the stream itself, and aborting the browser's
 * request aborts the upstream one so the service frees the stream.
 */
export async function relayStream(request: Request) {
  const token = sessionToken(request);
  if (!token) return unauthenticated();

  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`,
  };
  // `EventSource` sends it on every reconnect; it is how missed
  // notifications are caught up.
  const lastEventId = request.headers.get('Last-Event-ID');
  if (lastEventId !== null) headers['Last-Event-ID'] = lastEventId;

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl()}/notifications/stream`, {
      headers,
      cache: 'no-store',
      signal: request.signal,
    });
  } catch {
    return unavailable();
  }

  // A 401 or 503 arrives as JSON before any stream starts.
  if (upstream.status !== 200 || !upstream.body) {
    try {
      return await passThrough(upstream);
    } catch {
      return unavailable();
    }
  }
  return new Response(upstream.body, { status: 200, headers: SSE_HEADERS });
}

/** Keeps only the query parameters a relay route forwards. */
export function forwardQuery(request: Request, path: string, names: string[]) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const name of names) {
    const value = incoming.get(name);
    if (value !== null) query.set(name, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
