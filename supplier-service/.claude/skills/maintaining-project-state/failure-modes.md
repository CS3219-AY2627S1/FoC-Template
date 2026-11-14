# Failure Modes

How this document decays, and the counter for each. Read when you notice yourself reaching for
a reason not to write something down.

## Rationalizations

| Excuse | Reality |
|---|---|
| "I'll update it at the end of the session" | Sessions end unpredictably — context runs out, the operator closes the window, a task derails. The update is always what gets lost. Write at the boundary, not after it |
| "Writing it down slows me down" | Rediscovering state costs a whole session. You are trading sixty seconds against an hour |
| "It's a small change, it doesn't need recording" | Ceremony scales with size; the record does not. A one-line behaviour change is exactly the kind of thing nobody can find later |
| "The spec already covers this" | The root document must be readable alone. A reader who has to open three files to learn the current status will not open any of them |
| "I'll put the full detail here so it's all in one place" | Bloat is what makes it go unread, and an unread source of truth is worse than none |
| "This decision was implicit / obvious" | Implicit decisions get silently reversed by the next agent, who has no idea one was ever made |
| "The plan file tracks task status, that is enough" | Nobody knows which plan is active without the root document. Plans are leaves; this is the index |
| "The operator just told me, I will remember" | You will not. The next session is a different you with none of this context |
| "The Progress cell should say what I did" | It should say where you are. A cell nobody can scan is a cell nobody reads — put the work in the ledger, the reason in a decision or deviation, and an ID in the cell |
| "I recorded the decision, so the architecture is covered" | A decision says what changed; § Architecture says what *is*. Rewrite the area's "Now" in the same edit, or the next agent reconstructs the design by replaying history |
| "Nothing meaningful changed" | Decide that consciously rather than drifting past it. If you edited a file, something changed |
| "I'm mid-task, I'll write it when this is done" | If the task derails — and derailed tasks are the ones most worth recording — it never gets written |
| "Another session is probably handling that" | Check its row's `Last touched` against `git log` before assuming. A stale `Active` row means nobody is |
| "I'll skip adding my session row, it's just a quick fix" | A quick fix is exactly what collides with another agent editing the same file at the same time. Claim the row first, delete it after if the fix really was that small |

## Common Mistakes

- **Narrating instead of stating.** "We explored several approaches and eventually decided…"
  Cut it. State the decision and the reason; the exploration is not load-bearing.
- **A stale Next Action.** The most damaging single field in the file. Reconcile it before you
  stop, every time.
- **Orphan specs.** A spec sitting in `docs/` with no workstream row pointing at it is
  invisible, and will be rewritten from scratch by someone who never found it.
- **Status drift.** `Building` on something untouched for weeks. See
  [reconciliation.md](reconciliation.md).
- **A decision log instead of a design.** Architecture-shaping decisions dumped into a flat
  table, with no section describing the system as it stands. Every reader then has to replay
  the log and guess which entries still hold.
- **Narrating the workstream.** Progress cells that grow into paragraphs. The table stops
  being scannable, and the detail is duplicated from the plan.
- **Fixing a Known Gap.** An entry in § Known Gaps is a decision, not a TODO. If you think it is wrong,
  raise it — do not quietly implement it.
- **Building through a recorded decision because the operator asked.** A request that collides
  with a Known Gap or out-of-scope entry is not permission to reverse it — the operator may not
  know the entry exists. Name the entry and confirm: keep the decision, or reverse it and record
  the reversal. Recording a reversal you chose yourself is still the wrong call.
- **Recording the outcome without the reason.** A decision with no *why* cannot be defended, so
  the next agent overturns it the first time it is inconvenient.
- **Deleting instead of archiving.** A deviation that is no longer live still explains why the
  code looks the way it does. Move it to the archive; never drop it.
- **Duplicating git.** The ledger records what changed for the user and why, at a level git
  cannot: "conflict warnings are now override-able, per C3" — not "merged PR 12". Cite the
  commit as a reference; the commit is not the entry.
- **A session row nobody prunes.** A finished session left `Active` makes the table lie about
  what is actually in flight — same failure as a stale `Building` workstream, same fix.
- **Resolving a merge conflict by picking a side.** Decisions, Deviations, Known Gaps, the Done
  ledger and the session table are append-only lists — the answer is almost always to keep both
  entries and renumber, not to choose one. Dropping an entry to make the merge look clean erases
  a decision or trap that has nowhere else to live. See
  [merging-across-branches.md](merging-across-branches.md).
