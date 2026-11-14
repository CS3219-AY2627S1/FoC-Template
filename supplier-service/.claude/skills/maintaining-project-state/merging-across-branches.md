# Merging Across Branches — Reconciling a Diverged PROJECT_STATE.md

Two branches can each write to `PROJECT_STATE.md` independently — different workstreams, or
different sessions on different branches per the session table. Most of the time git merges
this the way you'd want. This is the convention for the rest, and how to tell which is which.

## Append-only sections merge mechanically

§ Decisions & Context, § Deviations & Discoveries, § Known Gaps, § Needs a Human, the Done
ledger, and the session table in § How to Resume are all newest-first, ID-keyed lists whose
entries are independent of each other. A git conflict here is almost always two branches adding
an entry near the same spot with colliding or adjacent IDs — not a disagreement about content.

**Resolve it by keeping both entries.** Renumber whichever ID collides with one already used on
the branch you are merging into, to the next free number in that namespace, in date order.
Never drop an entry to make the merge look clean — a deleted Decision or Deviation is a decision
or a trap that no longer has anywhere to live, and this skill exists specifically so that never
happens silently.

```text
<<<<<<< HEAD
| C28 | 2026-09-20 | ... |
=======
| C28 | 2026-09-21 | ... |
>>>>>>> feature-branch
```

becomes, keeping both and renumbering the later one:

```text
| C28 | 2026-09-20 | ... |
| C29 | 2026-09-21 | ... |
```

The same move applies to a session-table collision (two branches both added `S4`) and to a Done
ledger conflict. If an entry references its own ID elsewhere in the file (a Progress cell citing
a Decision, say), fix the citation in the same edit.

## Prose sections need real judgment — do not apply the mechanical rule to them

§ Architecture's "Now" paragraphs, the Workstream Progress cells, and § Orientation describe
**what the system currently is**. If two branches changed the same area's behavior, that is a
genuine disagreement about reality, not a formatting collision, and "keep both" produces a
paragraph that contradicts itself.

Treat it exactly like a code conflict: read both versions, work out what is actually true of the
*merged* code — build and check it if you have to — and write the "Now" paragraph fresh so it
describes one reality. Do not keep both versions side by side for the reader to reconcile
themselves.

If the two descriptions cannot both be true and you cannot tell which one matches the merged
code, stop and raise it in § Needs a Human rather than guessing — this is the "both plausible,
genuinely unclear" case in [reconciliation.md](reconciliation.md), and applies here too.

If the merge changed what an area *is* — not just how it's described — record why in a Decision
or Deviation, the same as any other architecture change. A merge does not exempt you from
writing immediately when the shape of the system changes.

## After merging

Run the normal check in [reconciliation.md](reconciliation.md) against the **merged** result,
never either branch's pre-merge state — a merge can silently reintroduce a stale `Building`
status, or leave a session row for work that already finished on the branch you merged in.

Then update `Last verified against repo`, and add a Done ledger entry for the merge itself if it
combined two branches' independent work — citing the merge commit, not narrating the conflict
resolution.
