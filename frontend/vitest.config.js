/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Added the frontend's Vitest setup (jsdom environment, React Testing Library,
 *        jest-dom matchers), per instructions.md Stage 20b, which called for stopping to ask
 *        before adding a test runner since none existed yet. The user chose Vitest + React
 *        Testing Library.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    globals: true,
  },
});
