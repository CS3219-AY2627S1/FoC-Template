/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Errand routes: parse and validate, call the domain and repository, map the result. Authorization
 *        is enforced by the repository (relationship to the errand) and requireRole (admin routes).
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: POST /errands handles the archived, unavailable and unauthenticated supplier outcomes,
 *        per the User and Supplier integration plan.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: mounted the N2 extraction routes before /errands/:id, per the approved N2 spec.
 * Author review: Pending review by @mattis.
 */
import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";
import type { Principal, SessionVerifier } from "../adapters/sessionVerifier";
import type { SupplierDirectory } from "../adapters/supplierDirectory";
import { ERRAND_STATES, type ErrandState } from "../domain/states";
import type { Action } from "../domain/transitions";
import { validateCreateErrand, type FieldError } from "../domain/validation";
import type { Errand } from "../errands/errand";
import { adminListErrands, getErrandForViewer, listMine, listOpen, type HistoryEntry, type Page } from "../errands/queries";
import { applyTransition, createErrand } from "../errands/repository";
import { extractionRoutes, type ExtractionDeps } from "./extractionRoutes";
import { requireRole } from "./auth";
import { sendError, sendNotFound, sendTransitionFailure, sendValidation } from "./errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON = 500;

// ---- Serialization (one place, used by every response) ----

function iso(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

export function serializeErrand(e: Errand) {
  const { reservationOperationId: _omitted, ...rest } = e;
  return {
    ...rest,
    reservationDeadline: iso(e.reservationDeadline),
    listingDeadline: iso(e.listingDeadline),
    pickupDeadline: iso(e.pickupDeadline),
    deliveryDeadline: iso(e.deliveryDeadline),
    confirmDeadline: iso(e.confirmDeadline),
    createdAt: iso(e.createdAt),
    updatedAt: iso(e.updatedAt),
    acceptedAt: iso(e.acceptedAt),
    pickedUpAt: iso(e.pickedUpAt),
    deliveredAt: iso(e.deliveredAt),
    closedAt: iso(e.closedAt),
  };
}

function serializeDetail(e: Errand & { history: HistoryEntry[] }) {
  return { ...serializeErrand(e), history: e.history.map((h) => ({ ...h, at: h.at.toISOString() })) };
}

function serializePage(p: Page<Errand>) {
  return { ...p, items: p.items.map(serializeErrand) };
}

// ---- Query parsing ----

function wholeNumber(raw: unknown, field: string, min: number, max: number, dflt: number, errors: FieldError[]): number {
  if (raw === undefined) return dflt;
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    errors.push({ field, message: `${field} must be a whole number from ${min} to ${max}` });
    return dflt;
  }
  return Number(raw);
}

function paging(q: Request["query"], errors: FieldError[]) {
  return {
    page: wholeNumber(q.page, "page", 0, Number.MAX_SAFE_INTEGER, 0, errors),
    size: wholeNumber(q.size, "size", 1, 100, 20, errors),
  };
}

function optionalState(q: Request["query"], errors: FieldError[]): ErrandState | undefined {
  if (q.state === undefined) return undefined;
  if (typeof q.state === "string" && (ERRAND_STATES as readonly string[]).includes(q.state)) return q.state as ErrandState;
  errors.push({ field: "state", message: `state must be one of ${ERRAND_STATES.join(", ")}` });
  return undefined;
}

function optionalUuid(q: Request["query"], field: string, errors: FieldError[]): string | undefined {
  const v = q[field];
  if (v === undefined) return undefined;
  if (typeof v === "string" && UUID_RE.test(v)) return v.toLowerCase();
  errors.push({ field, message: `${field} must be a UUID` });
  return undefined;
}

function optionalReason(body: unknown, errors: FieldError[]): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== "object" || Array.isArray(body)) {
    errors.push({ field: "body", message: "body must be a JSON object" });
    return undefined;
  }
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (k !== "reason") errors.push({ field: k, message: "unknown field" });
  if (b.reason === undefined) return undefined;
  if (typeof b.reason !== "string" || b.reason.length > MAX_REASON) {
    errors.push({ field: "reason", message: `reason must be a string of at most ${MAX_REASON} characters` });
    return undefined;
  }
  return b.reason;
}

const user = (res: Response) => res.locals.user as Principal;

export function errandRoutes(deps: {
  pool: Pool;
  verifier: SessionVerifier;
  suppliers: SupplierDirectory;
  extraction: ExtractionDeps;
}): Router {
  const { pool, suppliers } = deps;
  const r = Router();

  r.post("/errands", async (req, res) => {
    const v = validateCreateErrand(req.body, new Date());
    if (!v.ok) return sendValidation(res, v.errors);
    // authenticate() has already checked that the header is present
    const lookup = await suppliers.findSupplier(v.value.supplierId, req.header("authorization")!);
    if (lookup.kind === "unauthenticated") return sendError(res, 401, "UNAUTHENTICATED", "A valid session is required");
    if (lookup.kind === "archived" && user(res).role === "ADMINISTRATOR") {
      return sendError(res, 422, "SUPPLIER_ARCHIVED", "Supplier is archived; restore it to create an errand.");
    }
    if (lookup.kind !== "active") return sendError(res, 422, "SUPPLIER_UNAVAILABLE", "The supplier does not exist or is no longer active");
    const errand = await createErrand(pool, user(res).id, v.value, lookup.supplier);
    res.status(202).json(serializeErrand(errand));
  });

  // Registered before /errands/:id so "open" and "mine" are not read as ids
  r.get("/errands/open", async (req, res) => {
    const errors: FieldError[] = [];
    const p = paging(req.query, errors);
    if (errors.length) return sendValidation(res, errors);
    res.json(serializePage(await listOpen(pool, user(res).id, p)));
  });

  r.get("/errands/mine", async (req, res) => {
    const errors: FieldError[] = [];
    const p = paging(req.query, errors);
    const state = optionalState(req.query, errors);
    let as: "requester" | "courier" = "requester";
    if (req.query.as !== undefined) {
      if (req.query.as === "requester" || req.query.as === "courier") as = req.query.as;
      else errors.push({ field: "as", message: "as must be requester or courier" });
    }
    if (errors.length) return sendValidation(res, errors);
    res.json(serializePage(await listMine(pool, user(res).id, { ...p, as, state })));
  });

  // N2: /errands/extract and /errands/extract/status, before /errands/:id
  r.use(extractionRoutes(deps.extraction));

  r.get("/errands/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return sendNotFound(res);
    const e = await getErrandForViewer(pool, id.toLowerCase(), user(res));
    if (e === null) return sendNotFound(res);
    res.json(serializeDetail(e));
  });

  const actions: Action[] = ["accept", "withdraw", "pickup", "deliver", "confirm", "reject", "cancel"];
  for (const action of actions) {
    r.post(`/errands/:id/${action}`, async (req, res) => {
      const id = String(req.params.id);
      if (!UUID_RE.test(id)) return sendNotFound(res);
      let reason: string | undefined;
      if (action === "reject") {
        const errors: FieldError[] = [];
        reason = optionalReason(req.body, errors);
        if (errors.length) return sendValidation(res, errors);
      }
      const u = user(res);
      const result = await applyTransition(pool, id.toLowerCase(), action, { kind: "user", id: u.id, role: u.role }, { reason });
      if (!result.ok) return sendTransitionFailure(res, action, result);
      res.json(serializeErrand(result.errand));
    });
  }

  r.use("/admin", requireRole("ADMINISTRATOR"));

  r.post("/admin/errands/:id/resolve", async (req, res) => {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) return sendNotFound(res);
    const b = req.body;
    const errors: FieldError[] = [];
    if (typeof b !== "object" || b === null || Array.isArray(b)) {
      return sendValidation(res, [{ field: "body", message: "body must be a JSON object" }]);
    }
    for (const k of Object.keys(b)) if (k !== "outcome" && k !== "reason") errors.push({ field: k, message: "unknown field" });
    if (b.outcome !== "COURIER" && b.outcome !== "REQUESTER") {
      errors.push({ field: "outcome", message: "outcome must be COURIER or REQUESTER" });
    }
    if (typeof b.reason !== "string" || b.reason.length < 1 || b.reason.length > MAX_REASON) {
      errors.push({ field: "reason", message: `reason must be 1 to ${MAX_REASON} characters` });
    }
    if (errors.length) return sendValidation(res, errors);
    const action: Action = b.outcome === "COURIER" ? "resolveForCourier" : "resolveForRequester";
    const u = user(res);
    const result = await applyTransition(pool, id.toLowerCase(), action, { kind: "user", id: u.id, role: u.role }, { reason: b.reason });
    if (!result.ok) return sendTransitionFailure(res, action, result);
    res.json(serializeErrand(result.errand));
  });

  r.get("/admin/errands", async (req, res) => {
    const errors: FieldError[] = [];
    const p = paging(req.query, errors);
    const state = optionalState(req.query, errors);
    const requesterId = optionalUuid(req.query, "requesterId", errors);
    const courierId = optionalUuid(req.query, "courierId", errors);
    if (errors.length) return sendValidation(res, errors);
    res.json(serializePage(await adminListErrands(pool, { ...p, state, requesterId, courierId })));
  });

  return r;
}
