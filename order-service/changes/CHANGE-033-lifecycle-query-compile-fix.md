# CHANGE-033 — Align lifecycle repost query with explicit unassigned selection

- Date: 2026-09-30
- Status: Implemented; Docker build verified
- Scope: Order Service lifecycle processing

## Problem

The repository method was intentionally renamed to
`findByStatusAndExpiresAtLessThanEqualAndCourierIdIsNull`, but automatic repost
processing still called the removed shorter method. Docker compilation failed
with a `cannot find symbol` error in `LifecycleProcessingService`.

## Fix

Automatic repost processing now uses the same explicit unassigned-order query.
This preserves the rule that lifecycle expiry/repost processing must not select
an order with an assigned courier and restores repository/service consistency.

## Verification

`docker compose build order-service` completed successfully, including the
Spring Boot Maven compilation and layered JAR extraction. No peer-service or
learning file was changed.
