---
name: foc-commit
description: Group and commit requested FoC changes with ownership-aware staging and verification.
---

# FoC Commit

Use when commits are requested. This skill is self-contained. Follow the reading path in
[root AGENTS.md](../../../AGENTS.md) for the affected services.

1. Inspect status, staged/unstaged diffs, untracked files, ignore rules and recent history.
   Preserve unrelated work; stage explicit paths/hunks. Exclude secrets, generated build/cache
   output and ignored files; never force-add them.
2. Group by coherent behavior and service ownership. Keep related tests, migrations, contract
   documentation and regenerated client types with their behavior; separate independent features
   or documentation-only work. Check that affected-owner reviews required by root rules exist.
   Ask only if grouping or authorization remains materially ambiguous.
3. Reuse current verification evidence for the exact changes. Run missing/stale checks from the
   owning service's documented commands. Inspect the full staged diff before each commit.
4. Use Conventional Commit subjects without scopes unless requested, e.g.
   `docs: clarify order lifecycle`. Commit and inspect the result; report hashes, subjects,
   verification and remaining uncommitted work.

Do not push, amend, rebase, merge, reset, deploy or bypass hooks without separate authorization.
