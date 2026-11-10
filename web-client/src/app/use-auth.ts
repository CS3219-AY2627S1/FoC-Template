/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
