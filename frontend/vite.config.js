/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Added the development proxy from /api/v1 to the supplier service and /auth, /users to the user service. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-10-16): Made development proxy targets configurable so the
 *        frontend container can reach backend services over the Compose network.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5), date: 2026-10-19
 * Scope: Added the /credits proxy to the credit service. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 * Scope (2026-10-19): Restored environment-configured proxy targets so Docker
 *        uses service names while host-run Vite uses localhost. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration - /socket.io (WebSocket upgrade) proxied to the
 *        order service for its Socket.IO order events. No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Added the /admin/audit-logs proxy to the user service, per instructions.md Stage 26e.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 * Scope (2026-11-08, Codex, model: GPT-6): Connected the team-requested frontend chat entry points and existing HTTP contracts.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented team-specified chat room subscriptions and realtime frontend updates.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Added the /admin/send-otp, /admin/verify-otp and /admin/resend-otp proxies to the
 *        user service, per instructions.md Stage 27c (same target as /admin/audit-logs).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const orderServiceUrl =
  process.env.VITE_ORDER_SERVICE_URL ?? "http://localhost:3002";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Development stand-in for the single API gateway: the browser only ever talks to this origin, so no
  // CORS is involved (SupplierServiceArchitecture.md §3, §9 item 18). Ports are the compose published ports.
  server: {
    proxy: {
      "/api/v1":
        process.env.VITE_SUPPLIER_SERVICE_URL ?? "http://localhost:3004",
      "/auth": process.env.VITE_USER_SERVICE_URL ?? "http://localhost:3001",
      "/users": process.env.VITE_USER_SERVICE_URL ?? "http://localhost:3001",
      "/admin/audit-logs":
        process.env.VITE_USER_SERVICE_URL ?? "http://localhost:3001",
      "/admin/send-otp":
        process.env.VITE_USER_SERVICE_URL ?? "http://localhost:3001",
      "/admin/verify-otp":
        process.env.VITE_USER_SERVICE_URL ?? "http://localhost:3001",
      "/admin/resend-otp":
        process.env.VITE_USER_SERVICE_URL ?? "http://localhost:3001",
      "/credits":
        process.env.VITE_CREDIT_SERVICE_URL ?? "http://localhost:3003",
      "/orders": orderServiceUrl,
      "/chat/conversations":
        process.env.VITE_CHAT_SERVICE_URL ?? "http://localhost:3005",
      // Order events (Socket.IO, websocket transport only).
      "/chat-socket.io": {
        target: process.env.VITE_CHAT_SERVICE_URL ?? "http://localhost:3005",
        ws: true,
      },
      "/socket.io": { target: orderServiceUrl, ws: true },
    },
  },
});
