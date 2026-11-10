/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Scope: Integrated Supplier routes and styles with the existing application entry point.
 * Author review: I validated correctness, and added boundary checks.
 */

// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Scope: Registered the Order feature styles in the web entry point.
// Author review: I validated correctness and added boundary checks where needed.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/supplier.css";
import "./styles/workspace.css";
import "./styles/order.css";
import "./styles/wallet.css";
import "./styles/chat.css";
import "./styles/admin.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
