# ADR-022: Quarter-hour errand time selection and scheduler cadence

> Scheduler settings/cadence superseded by ADR-026 / CHANGE-083: one shared
> minute job and 15-minute recovery. Quarter-hour UI selectors remain.

> The pending-event recovery interval in this ADR was superseded by [ADR-023](ADR-023-hourly-outbox-recovery.md). The 15-minute expiry, one-minute auto-completion, and immediate after-commit dispatch decisions remain effective.

- Status: Accepted by explicit user direction; implementation verified locally; browser/cloud scheduling checks pending
- Date: 2026-10-08
- Owner: Order Service and approved shared frontend Requester slice
- Related change: CHANGE-077
- Supersedes: the once-per-minute expiry default in ADR-015 and once-per-minute outbox recovery default in CHANGE-063; preserves ADR-013 immediate dispatch and ADR-020 completion timing

## Decision

Requester creation expiry and automatic repost time, plus the expiry of a manually created repost, use local date/hour selectors with only 00, 15, 30, and 45 minute choices. Round default/minimum suggestions up to the next quarter-hour, preserving the existing at-least-30-minute expiry requirement. Client validation rejects invalid/off-slot selections and nonzero seconds. Display the existing shared Input/Select components; keep responsive layout and authentication/backend authorization unchanged. Delivery duration is still a quantity of minutes and is not restricted to these clock-minute choices.

The existing ISO-8601 UTC request shape and server-side valid-expiry rules remain unchanged. API callers and existing rows can still contain arbitrary valid deadlines. The DB expiry query selects all due OPEN unassigned orders, not only rows exactly matching the cron minute. No stored time is rounded or migrated.

- Expiry scan: ORDER_EXPIRY_CRON defaults to 0 */15 * * * * (minutes 00, 15, 30, 45).
- Pending-event recovery at the time of this ADR: ORDER_OUTBOX_RECOVERY_CRON defaulted to 0 */5 * * * *; ADR-023 supersedes this value with hourly recovery.
- Delivered-order auto-completion: ORDER_AUTO_COMPLETION_CRON stays 0 * * * * *. The 48-hour rule measures the actual delivered checkpoint; it does not round delivery time.
- Immediate after-commit publication remains active. The five-minute schedule is recovery for interrupted/failed publication, not a delay for every event.

## Rationale and consequences

This reduces periodic database scans while making new UI deadlines align to quarter-hours. Compared with a native datetime input and step alone, a four-option minute selector makes the allowed choices explicit. Compared with rejecting off-slot timestamps server-side, client-only selection preserves API compatibility and historical rows.

An arbitrary existing/API deadline can wait until the next 15-minute pass to become EXPIRED and produce its refund event. Availability and acceptance continue to reject deadlines already reached regardless of stored status or scheduler timing. Under this ADR, a failed publication could wait for the next five-minute recovery pass; ADR-023 supersedes that interval. Scheduled execution, load and failed batches can cause further delay. Cloud Run's existing scale-to-zero/request-based CPU does not guarantee in-process scheduling while idle; no billing/deployment execution model is changed here.

## Verification

Tests cover rounding across midnight and seconds, exact permitted minute choices, disabled repost controls, rejection before API calls, creation/manual-repost UTC payloads, and Spring cron next-run boundaries. Frontend lint/type checking and backend test/coverage checks are required. Browser visual/responsive verification and deployed scheduler behavior remain unverified when their runtimes are unavailable. No event payload, peer API, database schema or migration changes.
