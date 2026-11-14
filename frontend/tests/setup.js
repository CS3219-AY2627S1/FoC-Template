/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Vitest setup file (jest-dom matchers, auto cleanup), per instructions.md Stage 20b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
