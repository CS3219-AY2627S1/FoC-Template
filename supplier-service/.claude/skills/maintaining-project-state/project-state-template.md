# Project State — <Project Name>

**Living document — the source of truth for this project.** Read it in full before doing
anything, then run `git log --oneline -20` to confirm it still matches reality. Update it at
every boundary, not at the end of the session.

- **Phase:** <e.g. MVP build / hardening / shipped>
- **Stack:** <e.g. Next.js, Prisma, Postgres (Neon), Auth.js, Vercel>
- **Branch:** <branch> (from `main` at `<sha>`)
- **Method:** <e.g. subagent-driven development; implementer then spec review then quality review>
- **Last updated:** YYYY-MM-DD by <model / agent> — <what changed, five words>
- **Last verified against repo:** YYYY-MM-DD
- **Developer guide:** <not created — or: seeded from [spec](docs/superpowers/specs/....md) on YYYY-MM-DD>

Sections are ordered by how often they are needed: **1–3 say where we are, 4–5 say what the
system is, 6–7 say what not to touch and what is stuck, 8–10 are the record.** Cite sections by
name (`§ Known Gaps`), not by number, so they can be reordered without breaking references.

---

## 1. Orientation

<Two or three sentences: what this project is, who uses it, what problem it solves. Enough that
an agent who has never seen the repo knows what it is looking at.>

**Repo map** — where documents live. Code layout is in § Architecture.

| Path | What lives there |
|---|---|
| `docs/superpowers/specs/` | Design specs — one per feature-level workstream |
| `docs/superpowers/plans/` | Implementation plans |
| `docs/project-state/done-ledger.md` | The Done ledger — every change, newest first |
| `<dir>` | <purpose> |

---

## 2. How to Resume

```bash
<checkout / install / test / typecheck commands that get you to a known-good state>
```

**Sessions in flight** — one row per operator-initiated session, however many agents or
subagents it runs. This is "who's doing what right now," not a history: prune a row the moment
its work lands in § Workstreams or the Done ledger. If nothing else is running, the table still
has your own row, `Active`, with `Doing` pointing at the next concrete step you are about to
take.

| Session | Started | Agent(s) | Branch | Workstream | Status | Doing | Last touched |
|---|---|---|---|---|---|---|---|
| S4 | YYYY-MM-DD HH:MM | <model/agent> (lead) + <subagent types, if any> | <branch> | W1 | Active | Task 6/9: conflict engine | YYYY-MM-DD HH:MM |
| S3 | YYYY-MM-DD HH:MM | <model/agent> | <branch> | — | Blocked — needs human | Q2 | YYYY-MM-DD HH:MM |

Status vocabulary, used verbatim: `Active` · `Paused` · `Blocked — needs human` (name the
question ID, same as a workstream row).

---

## 3. Workstreams

One row per feature-level-or-larger unit of work. Small changes do not appear here; they go
straight to the Done ledger.

**Progress is a position, not a diary** — at most ~15 words: where in the plan, what is in
flight, and the ID of anything blocking or explaining it. What was built goes in the plan and
the Done ledger; why anything changed goes in § Decisions or § Deviations, cited here by ID
only. Update it when a task starts, finishes, or blocks.

| ID | Workstream | Status | Spec | Plan | Progress | Guide |
|---|---|---|---|---|---|---|
| W1 | <name> | Building | [spec](docs/superpowers/specs/....md) | [plan](docs/superpowers/plans/....md) | Task 6/9 in flight: conflict engine | — |
| W2 | <name> | Blocked — needs human | [spec](...) | [plan](...) | Task 3/8 stopped: Q2 | — |
| W3 | <name> | Not started | — | — | Deferred until W1 ships | — |

Status vocabulary, used verbatim: `Not started` · `Spec'd` · `Planned` · `Building` ·
`Blocked — needs human` · `In review` · `Done` · `Abandoned`

Guide vocabulary — developer-guide coverage, owned by the `update-documentation` skill:
`—` · `Awaiting confirmation` · `Pending` · `Documented YYYY-MM-DD` · `N/A`

---

## 4. Architecture

**How the system is put together, area by area — the shape first, then the decisions that
produced it.** This is the section to read before designing anything, and to update whenever a
workstream changes the shape of the system.

Describe what exists today. Anything settled but not built is marked *(planned)*; anything
merely proposed does not appear here at all.

```text
<A small map: the parts and how they connect. A directory sketch, a request path, or an
arrow diagram — whichever shows the real structure in under 15 lines.>
```

<Then one subsection per area. Areas mirror the system's real parts — data, a boundary such as
auth or tenancy, a core engine, the interface, integrations — not the folder listing. Three to
eight of them; add one when the part becomes real, not in anticipation.>

### 4.1 <Area>

**Now:** <What this area is and how it behaves today, in a few lines a newcomer can follow.
Name the real files and functions. Say what it must never do, if that is the point of it.>

| Path | Role |
|---|---|
| `<file>` | <what it owns> |

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C1 | YYYY-MM-DD | <the decision that shaped this area> | <rationale; what was rejected and why> | [spec §3](...) |

### 4.2 <Area>

**Now:** …

---

## 5. Conventions

Rules every change must honour. Breaking one is a bug even if the tests pass. Architecture says
how the system is shaped; this says what the shape demands of you.

- <e.g. every query in `lib/queries/` takes `workspaceId` as its first argument>
- <e.g. timestamps are stored UTC; only `lib/time.ts` formats or parses them>
- **ID namespaces:** `W` = workstream, `C` = decision, `D` = deviation, `Q` = needs a human,
  `S` = session. Numbers are unique across the whole file and never reused, wherever the entry
  sits.

---

## 6. Known Gaps & Accepted Limitations

Deliberately not built, or deliberately not fixed. **These are decisions, not a TODO list — do
not "helpfully" implement them.** If one looks wrong, raise it in § Needs a Human. If the
operator asks for one, confirm first: keep the decision, or reverse it and record the reversal.

- **<gap>** — <why it is deliberate; what would have to change to revisit it>

**Explicitly out of scope:** <deliberately rejected ideas, so nobody re-proposes them.>

---

## 7. Needs a Human

Anything an agent cannot do. Phrase each so a one-line reply or a short action unblocks it, and
say how much is blocked.

| ID | What is needed | What it blocks | Raised |
|---|---|---|---|
| Q1 | <action or decision> | <scope of the block; what can proceed meanwhile> | YYYY-MM-DD |

---

## 8. Decisions & Context

Decisions that do **not** shape the architecture — process, priorities, scope and sequencing,
tooling, ways of working. Architecture-shaping decisions live with their area in
§ Architecture, so each decision appears exactly once and keeps its ID wherever it sits.

| ID | Date | Decision | Why / who asked | Source |
|---|---|---|---|---|
| C2 | YYYY-MM-DD | <decision> | <rationale; what was rejected and why> | Operator conversation |

---

## 9. Deviations & Discoveries

Where reality diverged from a spec or plan, and traps found the hard way. **This section has no
other home** — it contradicts or post-dates the documents it refers to, so it is written here
in full rather than summarised. Newest first.

### D1 — <short title> (<where it was found>)

<What the document said, what is true instead, why. End with the consequence: what a future
agent must do differently, or what test now guards it.>

---

## 10. Record

The Done ledger lives in **[`docs/project-state/done-ledger.md`](docs/project-state/done-ledger.md)**
— every change, big or small, newest first. Write the line there, not here; a ledger inside this
file crowds out the sections read every session, and it is consulted only to answer "when did
this change, and why?".

- **Latest entry:** YYYY-MM-DD
- **Entries:** <n>

Deviations stay in § Deviations above: those are read every session.

The ledger file itself starts as:

```markdown
# Done Ledger — <Project Name>

The full chronological record of every change, newest first. One line each: what changed and
why, with a commit, plan or artifact as the reference. Not a copy of `git log`.

| Date | What changed | Workstream | Ref |
|---|---|---|---|
| YYYY-MM-DD | <outcome, user-visible where possible> | W1 | `<sha>` |

**Archive:** <none yet — start `archive-YYYY-QN.md` beside this file past ~100 entries>
```
