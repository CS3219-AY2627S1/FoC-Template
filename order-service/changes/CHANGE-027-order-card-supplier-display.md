# CHANGE-027 — Human-readable supplier display on Order cards

- **Date:** 2026-09-30
- **Status:** Implemented; frontend/runtime verification pending
- **Approver:** Vincent, 2026-09-30

## Problem

Order Service intentionally stores supplier references, but the shared frontend rendered those
IDs directly in every order card. The card also exposed the internal Order ID even though it was
not needed for the user-facing workflow.

## Approved solution

The frontend now batches the visible pickup and delivery IDs into the verified authenticated
Supplier Service `POST /api/suppliers/lookup` contract, displays supplier names/buildings, and
keeps IDs only in the Order object and action payloads. Missing lookup results fall back to the
reference ID. The order ID is no longer rendered in the card. Supplier Service and Order Service
contracts/source remain unchanged.

## Verification

Focused supplier-payload and OrderCard tests were added first. `git diff --check` and staged checks
passed. Vitest, typecheck, lint, build, and authenticated browser verification require Node/npm and
the local runtime; no completion claim is made until those checks run.
