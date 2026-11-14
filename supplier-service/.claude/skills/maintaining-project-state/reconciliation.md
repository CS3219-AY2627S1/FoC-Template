# Reconciliation — Verifying State Against the Repo

Status drift is what kills these documents. One stale `Building` row and the next agent stops
trusting the whole file — at which point it has negative value, because it is now a
confident-sounding lie.

Run this **once per session, right after reading `PROJECT_STATE.md`**, before acting on it.

## The Check

1. **Git first.** `git log --oneline -20` and `git status`. Does recent history match the Done
   ledger and the active workstream? Uncommitted work in the tree that nothing mentions is the
   loudest possible signal that the last session ended without writing.
2. **Every `Building` workstream.** Open its plan. Does the first unchecked task match what the
   repo actually contains? Does the referenced code exist?
3. **Every `Blocked — needs human` row**, workstream or session. Is it still blocked, or was the
   answer given in a session that never cleared the flag?
4. **Every session row in § How to Resume.** `Active` with a `Last touched` that predates recent
   git activity on its branch is a session that died without saying so — mark it `Paused` (or
   delete it if its work already landed) rather than leaving it looking live.
5. **Links.** Every spec and plan path resolves. A dead link is worse than no link.
6. **Architecture.** For any workstream that finished or changed shape since the last
   verification, does its area in § Architecture still describe the code? A "Now" paragraph
   that describes last month's design is the same failure as a stale `Building` row.
7. **Guide column.** List rows whose Guide is `Awaiting confirmation` or `Pending`, or whose
   Progress says `guide out of date`, and read the `Developer guide` header line. Raise them with
   the operator — this is how guide updates survive a session ending. See the
   `update-documentation` skill.
8. **Your own session row.** If it isn't there yet, add it before doing anything else — a
   different session may otherwise duplicate your work.
9. **Next Action.** Is the work implied by the session table's `Active`/`Paused` rows still the
   right thing to be doing given 1–8?

Correct what you find, then stamp `Last verified against repo` with today's date.

Cheap version — the whole check is usually under a minute:

```bash
git log --oneline -20
git status --short
ls docs/superpowers/specs docs/superpowers/plans
grep -E "Awaiting confirmation|Pending|guide out of date" PROJECT_STATE.md
```

## When the Document and the Repo Disagree

| Kind of claim | Winner | What to do |
|---|---|---|
| What the code does, what exists, what is committed | **The repo** | Correct the document. Note the correction in Deviations if it is surprising |
| What was decided, what is in scope, what was rejected, why | **The document** | The code is wrong or incomplete. Do not silently "fix" the document to match the code — that erases the decision |
| Both plausible, genuinely unclear | **Neither** | Do not guess. Raise it in Needs a Human and keep working on something else |

The asymmetry matters: code drifts from intent all the time, and the document is the only
record that intent ever existed. A decision quietly overwritten to match a stray commit is
unrecoverable.

## Do Not Skip This Because the File Looks Fine

A well-written stale file looks exactly like a well-written current one. The check is cheap
precisely so that it can be unconditional.

## After a Merge

If `git log` shows a merge that touched `PROJECT_STATE.md`, run this check against the *merged*
result, not either branch's pre-merge version — a merge can silently reintroduce a stale
`Building` status or leave a session row for work that already finished on the other side. See
[merging-across-branches.md](merging-across-branches.md) for how to resolve the merge itself
before you get here.
