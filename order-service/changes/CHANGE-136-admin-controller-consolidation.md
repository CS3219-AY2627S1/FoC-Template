# CHANGE-136 — Consolidate admin Order endpoints and annotation imports

Approved request from Yao Xiang, 2026-10-17, order-service/penalty-integration.
Sprint2–3 continuation; D1 NTH1 administrative oversight / ADR-044 and ADR-045.
Existing admin cancellation state, financial/penalty intent, hold, role, replay,
locking and timing rules remain exactly as approved. No new business interaction.

Move POST /api/orders/admin/{orderId}/cancel from the separate cancellation
controller into AdminOrderController, alongside the existing GET /api/orders.
Keep method-level RequireAdminRole and bearer documentation on both methods.
Retarget cancellation contention advice to that controller; application service
still owns the transactional work. Remove only the redundant controller class.
Keep the same URI/body/status/JSON and existing MapStruct mapping.

Keep JsonProperty on completionHold/overdue to preserve isCompletionHold and
isOverdue in JSON; Java/Lombok names alone would produce different keys.
Keep Schema descriptions/nullable documentation on the three timing fields and
import Schema once instead of writing its fully qualified name at each field.

Repoint existing route/security fixtures to AdminOrderController first; confirm
the cancellation route is missing there before moving it. Verify anonymous/nonadmin
rejection, decoded admin identity, validation, domain409, row contention409,
existing paged listing/local bypass and generated OpenAPI. Preserve existing merge
work. No new peer/API dependency, schema migration, UI or deployment change.

Context: parent/Order instructions, spec-driven skill, profile/allocation/active
work, sprint/context/ADRs/workflows/contracts/traceability/AI log reloaded; frontend
baseline inspected without edits. Source PDF fingerprints unchanged. User explicitly
authorizes this organization-only refactor; no approval or interaction remains open.

## Verification — completed

- RED: five cancellation MVC checks returned404 when only AdminOrderController
  was loaded, confirming the route lived in the separate controller.
- After move: all five cancellation checks pass, including decoded admin identity,
  anonymous401/non-admin403, request validation400, business409 and lock409.
- Complete root Maven verify passes common12 + Order458 =470 tests, zero
  failures/errors/skips; both original coverage gates and executable JAR pass.
- Generated OpenAPI groups both list and cancellation under admin-order-controller;
  original URI, body, security and nullable response fields remain documented.
- Existing list tests3, production security6, local bypass1 and OpenAPI4 pass.
  No frontend/runtime-layout change; no extra frontend/browser claim. Unchanged
  AsyncAPI checks pass; TOML407 qualified keys unique (not full TOML parsing).
- Old compiled controller and stale coverage cache were cleared before verify;
  no whole-target cleanup, backup deletion, source reset, staging, commit or push.
  Existing uncommitted work retained. No application rebuild/deploy/cloud mutation.

Running application images need the normal Order rebuild to serve this source.
Human/deployed review remains pending; previous Report/User integration limits
are unchanged and are not part of this controller refactor.
