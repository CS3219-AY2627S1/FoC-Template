<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Documented the disclosure convention for strict-JSON Supplier configuration files.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the third-increment final code-review remediation disclosure.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-26
Scope: Recorded the issue #25 `package.json` Swagger dependency disclosure.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Recorded the issue #33 metadata-endpoint implementation disclosure.
Contract decision and implementation reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-09-27
Scope: Recorded the standalone Bash API endpoint and journey collection disclosure.
Author review: Reviewed and approved by @ron.
Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-10-18
Scope: Recorded the issue #42 disposable Compose fixture compatibility disclosure.
Author review: Pending project-author review.
-->

# Supplier Service AI disclosures

## Strict JSON files

JSON does not permit literal comments. For a strict-JSON file that requires a leading AI disclosure, this project uses a leading `"//"` string-valued metadata property and records the full disclosure in this adjacent sidecar. The property is operational metadata, not JSON comment syntax. Each JSON consumer must be verified to accept it.

This convention is an unavoidable exception to putting a literal disclosure comment at the start of every AI-influenced file. **Course-owner approval for this strict-JSON exception is still required before submission.** Project-author review was completed and approved by @ron.

| JSON file | Tool and date | AI-assisted scope | Consumer verification |
| --- | --- | --- | --- |
| `package.json` | OpenAI Codex (GPT-6), 2026-09-25 and 2026-09-26 | Supplier backend package metadata, scripts, dependencies including the official NestJS Swagger integration, test configuration, and isolated Compose integration-check command | `npm ci`, `npm pkg get name`, unit/build scripts, and `npm run test:integration` accepted the leading property |
| `nest-cli.json` | OpenAI Codex (GPT-6), 2026-09-25 | Supplier NestJS compiler configuration | `nest build` accepted the leading property |

If the course owner does not approve this convention, the team must agree on an allowed disclosure mechanism before submission; removing the property without an approved replacement would lose the required per-file attribution.

## Third increment final review remediation

OpenAI Codex (GPT-6) assisted on 2026-09-26 with final review remediation for the administrator Supplier mutation increment. The work clarified the already-approved create-only duplicate contract, centralized the editable mutation-value type and ETag response helper, added focused regression coverage, and refactored the live integration runner into focused scenarios with a shared archive/restore precondition verifier. Full Supplier tests, typecheck, build, and the real-service integration smoke passed, followed by an independent cleanup check.

This remediation changed no frontend, User Service application code, migration, strict-JSON file, or API behavior. Project-author review was completed and approved by @ron; the separate course-owner exception above remains pending.

## Supplier OpenAPI documentation

OpenAI Codex (GPT-6) assisted on 2026-09-26 with adding the official NestJS Swagger dependency to `package.json`. The package retains its leading `"//"` disclosure metadata, npm accepts it, and full verification is recorded in the issue #25 usage-log entry. Project-author review was completed and approved by @ron; the separate course-owner strict-JSON exception remains pending.

## Supplier Building Code metadata

OpenAI Codex (GPT-6) assisted on 2026-09-27 with implementing issue #33 after @ron explicitly approved a backend-owned runtime metadata endpoint for long-term frontend consistency. The work derives a complete `{ code, label }` option set from the existing Supplier building registry, exposes it to authenticated MEMBER and ADMINISTRATOR callers, documents it in OpenAPI and the Supplier specification, and adds focused controller, generated-contract, and live Compose coverage. It changes no database state, Supplier CRUD behavior, frontend file, or User Service application code. The contract decision and implementation were reviewed and approved by @ron.

## Bash API demonstrations

OpenAI Codex (GPT-6) assisted on 2026-09-27 with adding a standalone Bash collection for
the existing User authentication and Supplier APIs. It includes thin commands for manual
endpoint calls, self-contained endpoint checks that prepare their own public-API
prerequisites, and MEMBER/ADMINISTRATOR journeys for reads, authorization, complete
archive-based CRUD, visibility, validation, and ETag concurrency. The scripts read local
credentials from the ignored `.env`, keep tokens in process memory, use temporary response
files, and do not change application code, database schema, Compose configuration, or User
Service files. Project-author review was completed and approved by @ron.

## Pull-request CI fixture compatibility

OpenAI Codex (GPT-6) assisted on 2026-10-18 with keeping the existing Supplier integration
runner compatible with the User Service's approved database-role and audit-log requirements.
The runner now supplies disposable test-only User database passwords and a valid test-only
audit HMAC key to its unique Compose project. It does not change User Service application
code, production credentials, schema, or Supplier API behavior. Project-author review is
pending.
