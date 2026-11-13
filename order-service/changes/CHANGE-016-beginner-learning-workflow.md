# CHANGE-016 — Beginner-Friendly Learning Workflow

- Date: 2026-09-29
- Status: Completed
- Scope: Order Service workflow and learning documentation only
- Application source changed: No
- Approved by: Vincent (workflow request)

## Purpose

Persist a reusable learning workflow for a beginner developing this cloud-native monorepo. The
workflow must teach both general engineering practice and the current Order Service application,
while preserving the existing specification, architecture-approval, traceability, and completion
gates.

## Changes

- Reused the existing `order-service/learning/` directory; no duplicate learning directory was
  created.
- Updated `order-service/AGENTS.md` with meaningful-learning, two-level explanation, traceability,
  architecture-evolution, approval, and response-reporting rules.
- Updated `order-service/.codex/skills/spec-driven-development/SKILL.md` with the executable
  learning-document workflow and the rule that learning supplements, rather than replaces, the
  required completion report.
- Registered `learning/` in `order-service/docs/instruction-map.md`.
- Updated the developer active-work handoff.

## Effective workflow

For meaningful concepts, setups, decisions, and implementation discoveries, reuse or update a
learning document. Explain the general transferable principle and the current-project application,
including alternatives, trade-offs, failure modes, testing, verification, and traceability. Ask
for approval before silently recording a major architecture, security, data, contract, deployment,
or operations choice as approved. Workflow-only learning updates must not modify application code.

## Response compatibility

The learning-specific response details (`What I learned`, `Why`, `Trade-offs`, `Learning
documentation`, `Verification`, and `Remaining questions`) are supplemental. The existing seven
required completion-report sections remain authoritative.

## Verification

- Existing learning directory and `gcp-resource-setup-learning.md` were reused.
- No application source was changed.
- `git diff --check` passed.
