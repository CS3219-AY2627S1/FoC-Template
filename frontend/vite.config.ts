// AI Assistance Disclosure
// Tool: Claude Code (Claude Opus 5), date: 2026-09-23
// Scope: Generated Vite configuration and the dev-server proxy that mirrors
//        the nginx one, so the app runs against the same paths in both.
// Reviewed by Ngooi Jun Sen.

import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// Backends run on the host during development. In the container they are
// reached by service name instead; see frontend/nginx.conf.
const SUPPLIER_SERVICE = 'http://localhost:8081';
const BADGES_SERVICE = 'http://localhost:4006';

/**
 * Admin and Supplier trust the gateway's identity headers, not the bearer
 * token. The dev server asks User Service the same way nginx and the gateway
 * do, then copies those headers onto the proxied request.
 */
/** The dev-server request. `tsc` here only loads Vite's types, not Node's `http` types. */
interface DevRequest {
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function devGatewayHeaders(userService: string): Plugin {
  return {
    name: 'dev-gateway-headers',
    configureServer(server) {
      server.middlewares.use(async (req, _res, next) => {
        const request = req as DevRequest;
        const url = request.url ?? '';
        const needsIdentity = url.startsWith('/api/v1/admin') || url.startsWith('/api/v1/supplier');
        const authorization = headerValue(request.headers.authorization);
        if (!needsIdentity || !authorization) {
          next();
          return;
        }
        try {
          const response = await fetch(`${userService}/api/v1/user/internal/authorize`, {
            method: 'GET',
            headers: { Authorization: authorization },
          });
          const userId = response.headers.get('x-user-id');
          const isAdmin = response.headers.get('x-is-admin');
          const permitted = response.headers.get('x-permitted-action');
          if (userId && isAdmin && permitted) {
            request.headers['x-user-id'] = userId;
            request.headers['x-is-admin'] = isAdmin;
            request.headers['x-permitted-action'] = permitted;
          }
        } catch {
          // Leave the headers unset. The target service reports the failure.
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Override either in frontend/.env.local; keep nginx.conf in step.
  const env = loadEnv(mode, '.', '');

  const userService = env.USER_SERVICE_URL || 'http://localhost:8080';
  const adminService = env.ADMIN_SERVICE_URL || 'http://localhost:8084';
  // Gateway mode: every /api call goes to the API gateway, which routes by
  // path and checks the token (deploy/README.md). Locally that's the cluster's
  // gateway via `deploy/local.sh gateway` (http://localhost:8080).
  const gateway = env.API_GATEWAY_URL;

  /*
   * Without a gateway, Order and Credit are not proxied. They identify the
   * caller from X-User-Id, which only the gateway's authorize check sets, and
   * the dev server cannot do that check. Set API_GATEWAY_URL, or run the
   * frontend container (nginx.conf does the check), to use the order pages
   * and credit balance.
   */
  const proxy: Record<string, ProxyOptions> = gateway
    ? { '/api': { target: gateway, changeOrigin: true } }
    : {
        // Supplier Service already serves this prefix, so nothing is rewritten.
        '/api/v1/supplier': {
          target: SUPPLIER_SERVICE,
          changeOrigin: true,
        },
        // Badges Service serves the contract's base path directly.
        '/api/v1/badges': {
          target: BADGES_SERVICE,
          changeOrigin: true,
        },
        // Every path below assumes the service serves the contract's base
        // path unchanged, as Supplier and Badges do.
        '/api/v1/user': {
          target: userService,
          changeOrigin: true,
        },
        '/api/v1/admin': {
          target: adminService,
          changeOrigin: true,
        },
      };

  return {
    plugins: [react(), ...(gateway ? [] : [devGatewayHeaders(userService)])],
    server: {
      port: 5173,
      // Same one-origin arrangement as nginx: the app only ever calls its own
      // origin, so there is no cross-origin request and no service needs CORS.
      proxy,
    },
  };
});
