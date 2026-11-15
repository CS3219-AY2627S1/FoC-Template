---
status: accepted
---

<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-10-18
Scope: Recorded the database topology trade-off explicitly approved by @ron for GitHub
issue #44. No AWS resources were created.
Author review: Decision reviewed and approved by @ron on 2026-10-18; final wording remains
subject to pull-request review.
-->

# Share one RDS instance across isolated service databases

Use one small single-AZ RDS for PostgreSQL instance for the temporary course environment,
with separate `users` and `supplier` databases and separate migrator and runtime roles.
Services cannot access each other's database, and no cross-database relationships are
allowed. This keeps the logical ownership boundary while avoiding the standing cost of two
RDS instances.

The shared instance deliberately creates a common capacity, maintenance, and failure
boundary. Move to separate instances if production availability, independent scaling,
security isolation, or additional services make that trade-off unacceptable.
