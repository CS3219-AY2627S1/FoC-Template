---
name: foc-test-design
description: Select focused automated tests and manual acceptance checks for an approved FoC feature.
---

# FoC Test Design

Use the approved brief and applicable service instructions from the
[root reading path](../../../AGENTS.md). Inspect affected tests and only relevant CI jobs.

Select success, validation, authorization, state/data integrity and regression cases proportionate
to the change. Derive domain-specific race, retry and rounding cases from service invariants;
include cross-service failure/reconciliation cases when integration is in scope.
Do not add unrelated suites.

Separate automated coverage from manual acceptance and identify unavailable test conventions or
environments. This stage defines checks; implementation adds them.
