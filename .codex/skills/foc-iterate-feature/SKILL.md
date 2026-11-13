---
name: foc-iterate-feature
description: Coordinate one FoC feature through approval, implementation, review, verification and manual acceptance.
---

# FoC Iterate Feature

Invoke `$foc-iterate-feature <service>-<iteration>: <one observable outcome>`.

Follow the reading path in [root AGENTS.md](../../../AGENTS.md). Apply each stage in the same
task; prior guidance and approvals remain valid unless scope or requirements change.

1. Apply `$foc-feature-analysis`; obtain explicit approval of the brief before editing.
2. Apply `$foc-test-design`, then `$foc-feature-implementation`.
3. Apply `$foc-ui-iteration` for interactive changes; otherwise skip it.
4. Apply `$foc-quality-review`, then `$foc-verify-feature`. Repair confirmed high-risk findings
   and verification failures in the responsible implementation/UI stage; review repairs and rerun
   affected checks.
5. Present manual checks and wait for explicit user acceptance. Return reported failures to the
   relevant stage. Report behavior, checks, manual outcome, limitations and next useful iteration.

Do not create workflow logs, commits, pushes, merges, deployments or automation unless requested.
