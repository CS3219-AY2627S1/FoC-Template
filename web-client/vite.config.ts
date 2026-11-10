/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-23
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-30
 * Scope: Implemented Supplier/Voice Assist proxy routing and refined Supplier query forwarding.
 * Author review: I validated correctness, and added boundary checks.
 */

// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Added the Order development proxy configuration.
// Author review: I validated correctness and added boundary checks where needed.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "^/v1/chat([/?]|$)": {
        target: "http://127.0.0.1:8004",
        changeOrigin: true,
        ws: true,
      },
      "^/v1/(orders|order-creations|admin/orders)([/?]|$)": {
        target: "http://localhost:8002",
        changeOrigin: true,
      },
      "^/v1/(wallets|admin/wallets|admin/credit)([/?]|$)": {
        target: "http://localhost:8003",
        changeOrigin: true,
      },
      "^/v1/(admin/disputes|admin/audit-log|disputes)([/?]|$)": {
        target: "http://localhost:8005",
        changeOrigin: true,
      },
      "^/v1/voice-assist([/?]|$)": {
        target: "http://localhost:8006",
        changeOrigin: true,
      },
      "/v1": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "^/api/v1/(categories|suppliers|admin/suppliers)([/?]|$)": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
});
