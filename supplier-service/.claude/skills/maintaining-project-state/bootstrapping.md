# Bootstrapping — Creating PROJECT_STATE.md

When the file does not exist. This is a one-time procedure; do it before any other work, and
do not let it expand into a project audit.

## Steps

1. **Copy the skeleton** from [project-state-template.md](project-state-template.md) to
   `PROJECT_STATE.md` at the repo root.
2. **Harvest what already exists**, in this order — earlier sources beat later ones on intent:
   - `docs/superpowers/specs/*` — purpose, decisions with reasons, explicit non-goals. The
     non-goals are gold: they populate § Known Gaps directly, and the spec's architecture
     section is the skeleton of § Architecture.
   - `docs/superpowers/plans/*` — task breakdowns, which become Workstreams. An unchecked task
     list tells you the real progress.
   - `git log --oneline` — the early Done entries, and the true current state.
   - README, package scripts, CI config — the How to Resume commands.
   - The source tree — only to confirm what the documents claim, never as the primary source.
3. **Fill Orientation, How to Resume, Workstreams and Needs a Human properly.** They are what
   a cold agent reads first. The rest can start sparse and grow.
4. **Sketch § Architecture from the spec, not the source tree.** One subsection per real part,
   each saying what exists today; mark anything settled but unbuilt *(planned)*. Move every
   decision that shaped a part into that part's table, leaving process decisions in
   § Decisions. If no code exists yet, the areas are the spec's, all *(planned)*.
5. **Backfill the ledger coarsely.** Create `docs/project-state/done-ledger.md` and write one
   line per milestone, not per commit; link it from § Record. History is context, not an audit
   trail — the ledger starts being precise from today.
6. **Mark what you inferred.** Anything deduced rather than read gets "(inferred)" on the entry.
7. **Report to the operator**: what you found, what you inferred, and every question the
   existing documents did not answer. Put those questions in Needs a Human as well, so they
   survive the end of the conversation.

## Bounds

- Do not read the whole source tree. Specs and plans are the source; code is confirmation.
- Do not invent decisions. If no document says why something is the way it is, write
  "unknown — no record" rather than a plausible reason. An invented rationale is worse than an
  admitted gap, because it gets cited later as fact.
- Do not start the real work until the operator has seen the bootstrap. This is the one moment
  when the whole project's context is up for correction, and it is cheapest to fix now.
