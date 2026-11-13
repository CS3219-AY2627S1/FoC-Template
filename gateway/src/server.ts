// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-10-20
// Scope: Remove Gateway authentication and identity-header injection while preserving proxy behavior.
// Author review: Review pending.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-02
// Scope: Hardened the Gateway reverse proxy to forward request IDs and
// preserve 404/502 handling while leaving authentication to downstream services.
// Author review: Reviewed to ensure all service routes are forwarded without
// Gateway-level authentication.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-02
// Scope: Fixed the reverse-proxy lifecycle by setting the request ID before
// rewriting the request body.
// Author review: Reviewed against the request-stream contract and the Node
// runtime requirement that headers must be set before body forwarding begins.

import "dotenv/config";
import express, {
  type Express,
  type Request,
  type Response
} from "express";
import cors from "cors";
import {
  createProxyMiddleware,
  fixRequestBody
} from "http-proxy-middleware";

import { env } from "./config/env.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { requestIdMiddleware } from "./middleware/requestId.js";

const app: Express = express();

const corsOptions = {
  origin: env.frontendOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-Id",
    "Cookie"
  ]
};

app.use(cors(corsOptions));
// Allow cropped supplier image_url data URLs (base64 JPEG) with headroom above the crop target.
app.use(express.json({ limit: "5mb" }));
// Supplier list/detail must not be served stale after an image crop save.
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(requestIdMiddleware);
app.use(loggerMiddleware);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    service: "api-gateway"
  });
});

const resolveRequestId = (req: Request): string | undefined => {
  const headerValue = req.headers["x-request-id"];

  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  const customReq = req as Request & {
    id?: string;
    requestId?: string;
  };

  if (typeof customReq.id === "string" && customReq.id.trim().length > 0) {
    return customReq.id.trim();
  }

  if (
    typeof customReq.requestId === "string" &&
    customReq.requestId.trim().length > 0
  ) {
    return customReq.requestId.trim();
  }

  return undefined;
};

const createJsonProxy = (
  target: string,
  pathFilter: (path: string) => boolean
) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter,
    on: {
      proxyReq: (proxyReq, req) => {
        if (!proxyReq.headersSent) {
          const requestId = resolveRequestId(req as Request);
          if (requestId) {
            proxyReq.setHeader("x-request-id", requestId);
          }
        }

        const expressReq = req as Request & {
          body?: unknown;
        };

        if (expressReq.body !== undefined && !proxyReq.headersSent) {
          fixRequestBody(proxyReq, expressReq);
        }
      },
      error: (_error, _req, res) => {
        const response = res as Response;

        if (
          response &&
          typeof response.status === "function" &&
          !response.headersSent
        ) {
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              status: 502,
              message: "Bad Gateway"
            })
          );
        }
      }
    }
  });

const publicAuthProxy = createJsonProxy(
  env.userServiceUrl,
  (path) =>
    path === "/api/auth/register" ||
    path === "/api/auth/login" ||
    path === "/api/auth/refresh"
);

const protectedAuthProxy = createJsonProxy(
  env.userServiceUrl,
  (path) => path === "/api/auth/logout"
);

const userProxy = createJsonProxy(
  env.userServiceUrl,
  (path) => path.startsWith("/api/users")
);

const supplierServiceProxy = createJsonProxy(
  env.supplierServiceUrl,
  (path) => path.startsWith("/api/suppliers")
);

const orderServiceProxy = createJsonProxy(
  env.orderServiceUrl,
  (path) => path.startsWith("/api/orders")
);

const creditServiceProxy = createJsonProxy(
  env.creditServiceUrl,
  (path) =>
    path.startsWith("/api/credit/wallet/") ||
    path.startsWith("/api/credit/tx/")
);

app.use(publicAuthProxy);
app.use(protectedAuthProxy);
app.use(userProxy);
app.use(supplierServiceProxy);
app.use(orderServiceProxy);
app.get("/api/credit/wallet/:user_id", creditServiceProxy);
app.get("/api/credit/tx/:user_id", creditServiceProxy);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 404,
    message: "Route not found"
  });
});

app.listen(env.port, "0.0.0.0", () => {
  console.log(`Gateway running on PORT ${env.port}`);
});