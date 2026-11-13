---
name: foc-integrate-service
description: Prepare and verify a completed FoC service's Kafka, gateway, Compose, CI and Kubernetes integration, or deploy its existing wiring to an explicitly selected local cluster. Use for service onboarding and runtime integration after implementation.
---

# FoC Integrate Service

Use `$foc-integrate-service <service-directory> prepare` to implement and verify integration
wiring. Use `$foc-integrate-service <service-directory> deploy-local context=<context>
namespace=<namespace>` to deploy existing reviewed wiring to the selected local cluster.
An invocation may request both. Resolve omitted intent from the request. With only a service
name, prepare integration and provide the remaining activation steps.

This is a service-independent integration workflow. Derive ports, paths, principals, topics,
resource names, credentials, build tools and dependencies from the selected service and approved
contracts. A service may need HTTP, Kafka, both, or neither. Integrate the capabilities it needs.

## Establish the scope

1. Locate the repository root, read its `AGENTS.md` and `TASK_SPLIT.md`, then the selected
   service's applicable instructions, README, manifests and integration contracts. Identify its
   owner, the task's shared-file editor, and affected owners. For an assigned teammate task,
   identify that teammate's agent task as editor. Ask for missing ownership information when
   the repository and request cannot establish it.
2. Inspect worktree changes and preserve unrelated work. Confirm the service has real build,
   startup and test entry points. For a documentation-only scaffold, report the missing runnable
   implementation and progress only with concrete preparation supported by available facts.
3. Distinguish new onboarding from an image/configuration update to existing integration.
   Reuse existing deployment helpers and approved adapters. Inspect current files on every run,
   including prior partial integration. Repeated runs must preserve data and credentials.
4. State a brief integration plan with the service's actual dependencies, intended environments,
   affected files, contract gaps and checks. Reuse session approvals. New cross-service contracts
   require the root rules' explicit ownership/behavior approval before their implementation.
   Continue independent preparation while unresolved dependencies are recorded.

## Prepare the integration

Read [runtime integration](references/runtime-integration.md) for the applicable Kafka,
HTTP/gateway, Compose and CI work. Read [Kubernetes rollout](references/kubernetes-rollout.md)
when preparing or applying cluster resources. Follow the service's implementation conventions.

Use `$foc-iterate-feature` from `.codex/skills/foc-iterate-feature/SKILL.md` for substantial
missing service behavior, preserving its brief approval and acceptance stages. Supply the actual
service and one bounded integration outcome. Routine wiring already covered by the approved
plan can proceed directly. Follow `$foc-quality-review` and `$foc-verify-feature` where available,
using their repository skill files if they are absent from the current skill catalog. If a
referenced workflow is unavailable, perform its applicable review/checks directly and state
the limitation. Select further work by the dependency it unblocks, rather than expanding into
another owner's domain implementation.

Maintain a compact dependency matrix in the service's existing integration documentation.
For each connection record caller/producer, receiver/consumer, API/topic and key, identity/trust,
network direction, failure/retry owner and evidence of readiness. Document operation identity,
duplicate and recovery behavior for mutations/messages. Link approved contracts instead of
copying wire schemas. Keep missing producer implementations visible as integration blockers.

## Verify and activate

Run supported service checks and affected shared checks. Exercise real broker/database/service
behavior in an isolated environment when dependencies are available. Keep test-only fixtures
explicit in the evidence. Check success, permission denial, duplicate/retry behavior, dependency
outage and persistence for affected capabilities. Preserve stable operation identities when
recovering uncertain results. Report skipped or unavailable checks with their actual limits.

Preparing integration authorizes edits and isolated verification. For shared runtime changes,
collect the root rules' affected-owner review and authorization for the concrete target rollout.
An explicit deploy-local request authorizes application to its selected local environment within
that reviewed scope. Resume existing authorization without asking again. Other clusters require
explicit target authorization. Complete reviewable files, checks and rollout/recovery instructions
before requesting any outstanding approval. Run bounded rollout waits and business smoke tests.
On failure, diagnose the failing component and apply an in-scope repair. If recovery would
require data destruction, credential rotation or an unapproved contract change, stop that step
and report the specific decision needed. Avoid repeated restarts without a new diagnosis.

Report the final state separately as prepared, verified in isolation, deployed, and manually
accepted. Include target context/namespace and image identity when deployed, commands/check
results, owner dependencies, and the next concrete action. A Pod's readiness alone cannot
establish end-to-end business completion. Commit/push only when requested, using `$foc-commit`.
