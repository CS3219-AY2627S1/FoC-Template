---
name: maintaining-project-state
description: Use when doing any work in this project - at session start before reading code or answering questions, when sizing a change as feature-level or larger, when a spec or plan is written, when a task starts/finishes/blocks, when the user makes a decision that shapes the design, and before ending a session or compacting context. Keywords - PROJECT_STATE.md, project state, source of truth, continuity, handoff, what was I doing, where did we leave off, status, roadmap, context window, switching models or agents.
---

# Maintaining Project State

## Overview

`PROJECT_STATE.md` at the repo root is the **single source of truth** for this project.

The operator switches between models, agents, and context windows — sometimes running several
sessions and agents at once, possibly on different branches. None of that history survives;
this document does. **Anything not written there did not happen.**

It is an **index, not a library** — with one exception: a fact that contradicts or post-dates
every spec and plan has nowhere else to live, so it lives here in full. Everything else is a
summary plus a link.

It is written for a human and a cold agent to read in the same pass, so it is ordered by how
often each part is needed: **where we are** (Orientation, How to Resume, Workstreams), **what
the system is** (Architecture, Conventions), **what not to touch and what is stuck** (Known
Gaps, Needs a Human), then **the record** (Decisions, Deviations, Done). Cite sections by name
— `§ Known Gaps` — never by number.

## Monorepo Adaptation (FoC)

*Added when this skill was copied from the SnoozeShare repo (2026-10-01); the rest of the skill is unchanged.*

This repo holds several independent services (`user-service`, `supplier-service`, `credit-service`,
`order-service`, `frontend`). **Each service is its own "project"**: it has its own
`<service>/PROJECT_STATE.md` and its own `<service>/docs/project-state/done-ledger.md`. Wherever
this skill says "the repo root", read "the service root". Work in one service reads and updates
that service's file only; a fact that crosses services (an API contract, a role string) is
recorded in both services' files and cross-referenced. Specs and plans that live in the shared
root `docs/superpowers/` are linked from the service's Workstreams table with a `../` path. The
root `AGENTS.md` disclosure rules still apply to every file written under this skill.

## Read Before You Act

At the start of every session, and after any compaction, **read `PROJECT_STATE.md` in full
before reading code, answering a question, or planning anything.** Never reconstruct state from
source: code shows what is, never what was decided, what was rejected, or what is half-built.

Then verify it still matches the repo — [reconciliation.md](reconciliation.md).
If the file does not exist — [bootstrapping.md](bootstrapping.md).

## Every Change Is Recorded — Size Decides the Ceremony

|  | **Big** — feature level and above | **Small** |
|---|---|---|
| **Examples** | New user-facing capability; new module, service, or page; schema or data-model change; new dependency or architectural shift; cross-cutting refactor; anything spanning more than one session | Bugfix inside an existing design; copy or style tweak; single-function refactor; added tests; config change |
| **Before coding** | Spec → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, plan → `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, and a Workstream row linking both | Nothing. Just do it |
| **After** | Workstream status + Done ledger entry | Done ledger entry |

The Done ledger is `docs/project-state/done-ledger.md`, not a section of the state file — a line
per change, newest first. `PROJECT_STATE.md` § Record links it and says when it last moved.

**Small never means unrecorded.** Ceremony scales with size; the written record does not. A
one-line fix still gets a Done line, and if it diverges from a plan, contradicts a spec, or
leaves a trap, it also gets a Deviations entry — that is where the detail belongs, not in the
ledger. Only pure no-ops (formatting, a typo in a comment) can pass unwritten.

Ambiguous size? **Treat it as big.** A spec you did not need costs twenty minutes; a feature
built without one costs a rewrite.

Use `superpowers:brainstorming` for the spec and `superpowers:writing-plans` — or the
`reviewed-plan` skill — for the plan.

**If the operator asks to skip the spec and plan on a big change:** say so once, then do as
asked. It is their call. Record the skip as a decision, so the missing document is visible to
whoever inherits the work.

**If a request collides with a recorded decision** — a Known Gap, the out-of-scope list, or a
Decisions entry — **stop and confirm before doing anything.** Name the entry, then ask which:

- **Keep the decision** — do not build it. Nothing changes.
- **Reverse it** — build it, record a decision reversing the entry (who asked, why), update or
  remove the entry, and give the work its own workstream if it falls outside the current one.

Act on neither until the operator answers — even if they said "just do it", since the request
does not show they knew it overturns a recorded decision. This takes precedence over the
skip-the-spec rule above. If the operator is unavailable, stop and put the question in Needs a
Human.

## Write Immediately When

1. **A workstream changes status, or a task starts, finishes, or blocks** — update the status
   and the Progress cell. On `Done`, set its **Guide** value and use the `update-documentation`
   skill.
2. **A session starts, changes what it's doing, spawns or retires an agent, or ends** — add or
   update its row in the § How to Resume session table immediately, not at the end. Delete the
   row once its work is fully reflected in § Workstreams or the Done ledger.
3. **The shape of the system changes** — a new part, a moved responsibility, a changed boundary
   or data model — update that area in § Architecture in the same write.
4. **The operator makes or changes a decision** affecting design, scope, or priorities —
   capture *who asked and why*, not just the outcome.
5. **A spec or plan is created or materially revised** — link it from its workstream.
6. **Work completes, or reality diverges from a plan** — ledger, status, and Deviations.
7. **The session is ending, context is low, or you are about to compact** — reconcile your
   session row (status, Doing, Last touched) so a different session can take over cold.
8. **You merge a branch whose `PROJECT_STATE.md` diverged from yours** — reconcile per
   [merging-across-branches.md](merging-across-branches.md) before trusting the file.

Not at the end, not batched: sessions end unpredictably and the update is what gets lost. **A
task is not complete until `PROJECT_STATE.md` reflects it.**

## Two Things Agents Get Wrong

**§ Architecture is structured by the system, not by history.** One subsection per real part —
data, a boundary such as auth or tenancy, a core engine, the interface, each integration —
each opening with what that part *is today*, then a table of the decisions that shaped it.
A reader learns the design by reading it top to bottom, never by replaying a decision log. A
decision that changed the shape of the system lives with its area; one that changed how the
work is done lives in § Decisions. Each appears exactly once and keeps its ID.

**The Progress cell is a position, not a diary.** At most ~15 words: where in the plan, what is
in flight, and the ID of whatever blocks or explains it — `Task 6/9 in flight: conflict engine`,
`Task 3/8 stopped: Q2`. What was built is in the plan and the Done ledger. Why something
changed mid-flight is a § Decisions or § Deviations entry, cited from the cell by ID only.

Both are spelled out in [document-structure.md](document-structure.md).

## The Acid Test

Before you stop, ask: **could a fresh agent, given only this file, take over any session's row
in § How to Resume correctly without asking a question?**

If no, the file is wrong — fix the file, not your answer to the question.

## Status Vocabulary

Use exactly these, so status stays greppable:

`Not started` · `Spec'd` · `Planned` · `Building` · `Blocked — needs human` · `In review` ·
`Done` · `Abandoned`

`Blocked — needs human` must always name what you need, in Needs a Human.

The Workstreams table also has a **Guide** column — `—` · `Awaiting confirmation` · `Pending` ·
`Documented YYYY-MM-DD` · `N/A` — owned by the `update-documentation` skill. It tracks the
developer guide, not the build.

The § How to Resume session table has its own, smaller vocabulary: `Active` · `Paused` ·
`Blocked — needs human`. A finished session isn't a status — its row is deleted once the work
lands in § Workstreams or the Done ledger.

## Red Flags — Stop and Write

- "I'll update PROJECT_STATE.md at the end" → you will run out of context first.
- "It's a small change" → small changes are recorded too. Always.
- "The spec already says this" → the root doc must be readable alone.
- "The operator told me, I'll remember" → you will not. Next session is a different you.
- "I'll put what I did this task in the Progress cell" → it is a position, not a diary. One
  line, then point at the plan, the ledger, or an ID.
- "The architecture is obvious from the code" → then it is obvious to nobody who has not read
  the code. Update the area in § Architecture.
- "I'll add the decision to the decisions table and move on" → if it changed the system's
  shape, the area's *Now* paragraph is now wrong too. Rewrite it in the same edit.
- "This gap looks like a bug, I'll fix it" → check Known Gaps first; it may be deliberate.
- "They asked for it, so the out-of-scope entry doesn't apply" → it does. Ask: keep or reverse?
- "Another session is probably on this" → check its row's `Last touched` against `git log`
  first. A stale `Active` row means nobody is.
- "This merge conflict is annoying, I'll just keep one side" → append-only sections keep both
  and renumber. See [merging-across-branches.md](merging-across-branches.md).

## Where the Rest Lives

Read these on demand, not every session:

| File | Read it when |
|---|---|
| [reconciliation.md](reconciliation.md) | Session start, after reading the file — verifying it against the repo, and resolving doc-vs-repo conflicts |
| [merging-across-branches.md](merging-across-branches.md) | You are merging a branch whose `PROJECT_STATE.md` diverged from yours — which conflicts are mechanical (keep both, renumber) and which need real judgment |
| [document-structure.md](document-structure.md) | Writing a non-obvious entry — what each section is for, how to structure § Architecture, how terse the Progress cell must be, what belongs here vs in a linked doc, size and archive limits |
| [worked-examples.md](worked-examples.md) | Writing a Next Action, decision, deviation, or ledger entry — good and bad versions of each |
| [failure-modes.md](failure-modes.md) | You are about to skip or shortcut an update, or the file has decayed |
| [bootstrapping.md](bootstrapping.md) | `PROJECT_STATE.md` does not exist yet |
| [project-state-template.md](project-state-template.md) | Creating the file — the skeleton to copy |
| `update-documentation` skill | A workstream reaches `Done`, a Guide value is `Awaiting confirmation` or `Pending`, a spec is approved and `docs/DeveloperGuide.md` does not exist, a Progress cell says `guide out of date`, or the guide contradicts the state file or code |
