# CHANGE-048 — Add on-demand Order Service CI rehearsal

**Date:** 2026-09-30
**Status:** Implemented
**Scope:** Order Service workflow skill and CI verification guidance

## Decision

The Order Service workflow now supports an explicit, one-time local CI
rehearsal before pushing to GitHub. It is not run automatically on every chat
turn or code change.

## Scope

When triggered, the rehearsal runs the applicable checks for:

- Order Service OpenAPI structural validation and Maven/JaCoCo verification;
- the approved shared frontend with npm install, lint, typecheck, and tests;
- the changed Order Service/frontend container builds; and
- Compose configuration validation when shared Compose or gateway files are
  involved.

Sibling-service jobs, Cloud infrastructure/IAM checks, GitHub workflow
linting, shellcheck, and authenticated browser tests remain outside the scoped
rehearsal unless explicitly requested.

## Boundary and reporting

The rehearsal never pushes, commits, resets, or changes Git history. Every
check is reported as passed, failed, skipped, or unavailable. Missing local
runtimes are verification limitations, not passes.

## Verification

The skill, repository skill index, and structured project context now describe
the explicit-trigger-only behavior and Order Service/frontend scope. No
application source, peer-service source, or learning file was changed.
