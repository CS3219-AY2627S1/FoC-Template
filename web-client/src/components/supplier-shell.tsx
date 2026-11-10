/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Updated shared shell integration for Order navigation.
// Author review: I validated correctness and added boundary checks where needed.

import type { PropsWithChildren } from "react";
import { WorkspaceShell } from "./workspace-shell";

export function SupplierShell({ children }: PropsWithChildren) {
  return <WorkspaceShell className="supplier-shell" userDescription="Find what you need around campus." adminDescription="Manage the suppliers available to your campus.">{children}</WorkspaceShell>;
}
