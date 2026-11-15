/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Authenticated history (#58) and own-balance read for the #65 summary.
 * Author review: Reviewed and approved by @phuc. */
import express from "express";
import { getBalance } from "./accounts";
import type { Pool } from "pg";
import { isDatabaseUnavailable } from "./dbAvailability";
import { errorMessage, log } from "./log";
import { VerificationUnavailable, type SessionVerifier } from "./sessionVerifier";
import { InvalidTransactionQuery, listTransactions, parseTransactionQuery } from "./transactions";

export function createHttpApp(pool: Pool, verifier: SessionVerifier) {
  const app = express();
  app.disable("x-powered-by");
  app.get(["/me/credit", "/me/credit/transactions"], async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const principal = await verifier.verify(req.get("authorization"));
      if (!principal) {
        res.status(401).json({ error: "UNAUTHENTICATED", message: "A valid active session is required." });
        return;
      }
      const params = new URL(req.originalUrl, "http://credit.internal").searchParams;
      if (req.path === "/me/credit") {
        if (params.size > 0) throw new InvalidTransactionQuery("The balance endpoint does not accept query parameters.");
        const balance = await getBalance(pool, principal.id);
        if (balance === null) {
          res.status(404).json({ error: "CREDIT_ACCOUNT_NOT_READY", message: "Your credit account is still being set up. Please try again shortly." });
        } else {
          res.json(balance);
        }
        return;
      }
      const query = parseTransactionQuery(params);
      res.json(await listTransactions(pool, principal.id, query));
    } catch (error) {
      if (error instanceof InvalidTransactionQuery) {
        res.status(400).json({ error: "INVALID_QUERY", message: error.message });
      } else if (error instanceof VerificationUnavailable || isDatabaseUnavailable(error)) {
        res.status(503).json({ error: "SERVICE_UNAVAILABLE", message: "Transaction history is temporarily unavailable. Please try again." });
      } else {
        log.error("transaction_history_failed", { error: errorMessage(error) });
        res.status(500).json({ error: "INTERNAL_ERROR", message: "Unable to retrieve transaction history." });
      }
    }
  });
  app.use((_req, res) => { res.status(404).json({ error: "NOT_FOUND", message: "No such endpoint." }); });
  return app;
}
