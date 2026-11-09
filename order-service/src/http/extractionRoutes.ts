/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: N2 routes GET /errands/extract/status and POST /errands/extract, in the order of checks in spec 3.4,
 *        with one errand_extraction log line per call (spec 3.7), per the approved N2 spec.
 * Author review: Pending review by @mattis.
 */
import { Router, type Response } from "express";
import {
  AnthropicErrandExtractor, StubErrandExtractor, type ErrandExtractor, type TokenUsage,
} from "../adapters/errandExtractor";
import type { Principal } from "../adapters/sessionVerifier";
import type { SupplierCatalogue } from "../adapters/supplierDirectory";
import { UpstreamUnavailableError } from "../adapters/upstream";
import type { LlmConfig } from "../config";
import { checkExtraction, filledFields, validateExtractRequest } from "../domain/extraction";
import { log } from "../log";
import { sendError, sendValidation } from "./errors";
import { ExtractionRateLimiter } from "./extractionRateLimit";

export interface ExtractionStatus {
  available: boolean;
  reason: null | "DISABLED" | "NOT_CONFIGURED";
}

export interface ExtractionDeps {
  status: ExtractionStatus;
  /** null whenever status.available is false */
  extractor: ErrandExtractor | null;
  catalogue: SupplierCatalogue;
  limiter: ExtractionRateLimiter;
  clock?: () => Date;
}

export function extractionStatus(config: Pick<LlmConfig, "mode" | "apiKey">): ExtractionStatus {
  if (config.mode === "off") return { available: false, reason: "DISABLED" };
  if (config.mode === "anthropic" && config.apiKey === null) return { available: false, reason: "NOT_CONFIGURED" };
  return { available: true, reason: null };
}

/** The extractor for the configured mode, or null when the feature is off (including anthropic with no key). */
export function createExtractor(config: LlmConfig): ErrandExtractor | null {
  if (config.mode === "stub") return new StubErrandExtractor(config.timeoutMs);
  if (config.mode === "anthropic" && config.apiKey !== null) {
    return new AnthropicErrandExtractor({ apiKey: config.apiKey, model: config.model, timeoutMs: config.timeoutMs });
  }
  return null;
}

export function extractionDeps(config: LlmConfig, catalogue: SupplierCatalogue): ExtractionDeps {
  return { status: extractionStatus(config), extractor: createExtractor(config), catalogue, limiter: new ExtractionRateLimiter() };
}

/** For apps built without N2 settings (tests of other routes): the feature reports DISABLED. */
export function disabledExtraction(): ExtractionDeps {
  return {
    status: { available: false, reason: "DISABLED" },
    extractor: null,
    catalogue: { listActiveSuppliers: async () => ({ kind: "ok", suppliers: [] }) },
    limiter: new ExtractionRateLimiter(),
  };
}

type Outcome =
  | "ok" | "invalid_request" | "unavailable" | "rate_limited" | "unauthenticated" | "supplier_unavailable" | "supplier_error"
  | "timeout" | "llm_error" | "refused" | "truncated" | "unusable_reply";

function sendRateLimited(res: Response, seconds: number): void {
  res.setHeader("Retry-After", String(seconds));
  sendError(res, 429, "RATE_LIMITED", `Too many extraction requests; try again in ${seconds} seconds`);
}

/** Registered before /errands/:id (see routes.ts), so "extract" is not read as an errand id. */
export function extractionRoutes(deps: ExtractionDeps): Router {
  const r = Router();
  const clock = deps.clock ?? (() => new Date());

  r.get("/errands/extract/status", (_req, res) => {
    res.json(deps.status);
  });

  r.post("/errands/extract", async (req, res) => {
    const started = Date.now();
    const user = res.locals.user as Principal;
    // One JSON line per call. Never the description, the reply or the Supplier list.
    const record = (outcome: Outcome, extra: { filledFields?: string[]; usage?: TokenUsage | null } = {}) =>
      log.info("errand_extraction", {
        userId: user.id,
        durationMs: Date.now() - started,
        outcome,
        filledFields: extra.filledFields ?? [],
        inputTokens: extra.usage?.inputTokens ?? null,
        outputTokens: extra.usage?.outputTokens ?? null,
      });

    const body = validateExtractRequest(req.body);
    if (!body.ok) {
      record("invalid_request");
      return sendValidation(res, body.errors);
    }
    const extractor = deps.extractor;
    if (!deps.status.available || extractor === null) {
      record("unavailable");
      return sendError(res, 503, "EXTRACTION_UNAVAILABLE", "Filling in an errand from a description is not available");
    }
    // A call already over the limit makes no Supplier request and isn't counted
    const early = deps.limiter.check(user.id);
    if (early !== null) {
      record("rate_limited");
      return sendRateLimited(res, early);
    }

    let listing;
    try {
      listing = await deps.catalogue.listActiveSuppliers(req.header("authorization")!);
    } catch (err) {
      // The error handler answers 503 (unavailable) or 500 (unexpected reply); the LLM is not called
      record(err instanceof UpstreamUnavailableError ? "supplier_unavailable" : "supplier_error");
      throw err;
    }
    if (listing.kind === "unauthenticated") {
      record("unauthenticated");
      return sendError(res, 401, "UNAUTHENTICATED", "A valid session is required");
    }

    // Check and record in one step, right before the LLM call
    const late = deps.limiter.take(user.id);
    if (late !== null) {
      record("rate_limited");
      return sendRateLimited(res, late);
    }
    const result = await extractor.extract({ description: body.description, suppliers: listing.suppliers, now: clock() });
    if (!result.ok) {
      record(result.outcome, { usage: result.usage });
      return sendError(res, 502, "EXTRACTION_FAILED", "The errand details could not be worked out from the description");
    }
    const ids = new Set(listing.suppliers.map((s) => s.id.toLowerCase()));
    const extracted = checkExtraction(result.reply, ids, clock());
    if (extracted === null) {
      record("unusable_reply", { usage: result.usage });
      return sendError(res, 502, "EXTRACTION_FAILED", "The errand details could not be worked out from the description");
    }
    record("ok", { filledFields: filledFields(extracted), usage: result.usage });
    res.json(extracted);
  });

  return r;
}
