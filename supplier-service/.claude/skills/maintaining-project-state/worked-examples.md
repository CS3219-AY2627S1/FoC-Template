# Worked Examples

The template gives you the shape. This gives you the bar. Every pair below is the same fact
written badly and written well — the difference is whether a cold agent can act on it.

## Next Action

> ❌ Continue work on the conflict engine.

Useless. Which part? Where? What counts as done?

> ✅ Implement `computeAvailability()` in `lib/conflicts.ts` — Task 6 of the W1 plan, the first
> unchecked one. Peak-concurrent algorithm is specified in spec §5.3; the sweep-line shape is
> in the plan. Tests exist and fail: `npm test -- conflicts`.

Names the file, the task, where the algorithm is defined, and how you know when it works.
This is the single most damaging field to leave vague — it is what a cold session reads first.

## Decision

> ❌ | C3 | 2026-09-16 | Conflicts warn instead of blocking | Discussed with user |

Records the outcome and loses everything that makes it a decision.

> ✅ | C3 | 2026-09-16 | Conflicts warn and can be overridden; the event is flagged | Operator
> ruled out hard blocks — bookings get resolved out-of-band by phone, and a hard block would
> push users into entering fake data to get past it. Overriding must stay one click | spec §3 D3 |

The *why* is what stops a future agent "improving" this into a hard block. Record the rejected
option, not just the chosen one.

## Deviation

> ❌ Had to change the availability query, Prisma was being difficult.

Nobody can act on this, and in three weeks nobody will remember what "difficult" meant.

> ✅ **D2 — availability is a raw SQL sweep, not a Prisma aggregate (Task 6)**
>
> The plan's `groupBy` approach sums quantity across the whole window, which reports conflicts
> that do not physically exist — spec §5.3 requires *peak concurrent* usage. Prisma has no
> window-function support, so `computeAvailability()` uses `$queryRaw` with a sweep over
> reservation start and end events.
>
> Consequence: this query is not type-checked by Prisma. `tests/conflicts.peak.test.ts` pins
> the behaviour — if you change the schema, that test is the guard.

States what changed, why the documented approach was wrong, and what it costs you later.
This is the section that stops the next agent from "fixing" it back.

## Done Ledger — Small Change

Small changes are recorded too. They just get one line in `docs/project-state/done-ledger.md`
instead of a workstream.

> ❌ | 2026-09-17 | Fixed a bug | — | — |

> ✅ | 2026-09-17 | Buffer minutes were applied to the event end only, not the start, so overlapping pickups stopped warning. Fixed in `lib/conflicts.ts` | W1 | `a3f1c02` |

No spec, no plan, no ceremony — but the behaviour changed, so it is written down. If the fix
had contradicted the spec rather than implementing it, it would need a Deviations entry too.

## Workstream Row

> ❌ | W1 | Reservations | Finished | spec | plan | Going well, docs updated | Yes |

> ✅ | W1 | Inventory reservation MVP | Done | spec | plan | All 9 tasks done; confirmed 2026-09-20 | Pending |

`Done` and `Pending` come from fixed vocabularies, so they grep; "Finished" and "Yes" do not.
"Yes" hides whether the developer guide was proposed, held, or written — `Pending` says the
work is confirmed and not in the guide yet.

## Progress Cell

> ❌ Implemented the sweep-line engine after we found that the Prisma aggregate summed across
> the window, which the operator agreed was wrong; tests for buffers and adjacency all pass,
> now starting the API route but the database credentials still are not available.

Four facts buried in fifty words, and three of them belong elsewhere.

> ✅ Task 7/20 in flight: availability API. See D2, Q2

The position, what is in flight, and pointers. The sweep-line story is D2; the credentials are
Q2; "tests pass" is the Done ledger's job. A reader scanning five workstreams reads five of
these in one glance — which is the entire point of the column.

More shapes, all acceptable:

> ✅ Tasks 1–6 done; Task 7 next
> ✅ Task 3/8 stopped: Q2
> ✅ Spec approved 2026-09-16; plan not started
> ✅ All 20 tasks done; manual checks pending
> ✅ Task 5/9 in flight; guide out of date: buffer semantics

Update it whenever a task starts, finishes, or blocks — not once per session.

## Session Row

> ❌ | S2 | 09-19 | Claude | main | — | Active | Working on stuff | 09-19 |

Tells a resuming session nothing: which workstream, what "stuff," and a bare date can't be
checked against a `git log` timestamp to tell whether the row is stale.

> ✅ | S2 | 2026-09-19 09:10 | Codex | main | — | Blocked — needs human | Q4 | 2026-09-19 11:00 |

Names the workstream link (or `—` if it's not tied to one), a status a resuming session can act
on, a `Doing` cell that points at a Needs-a-Human ID instead of re-explaining it, and a precise
enough timestamp to judge staleness against `git log` during reconciliation.

> ✅ | S4 | 2026-09-20 14:02 | Claude Sonnet 5 (lead) + Explore×2 | w4-ui-redesign | W4 | Active | Task 3/6: D10 remediation | 2026-09-20 15:40 |

Same discipline as the Progress cell — a position and an ID, not a diary — plus enough about
the agent mix that a different session knows what kind of work was already delegated without
opening the transcript.

## Architecture Area

> ❌ (in a flat decisions table, nothing else)
>
> | C4 | 2026-09-16 | Workspace tenancy from day one | Operator wanted organisations to be additive later | spec D4 |
> | C9 | 2026-10-02 | `requireSession()` moved into `lib/workspace.ts` | It was being re-implemented per route | PR 41 |

Two true entries that never say what the system does now. To answer "how is tenancy enforced?"
you must find both, decide which still holds, and infer the rest from code.

> ✅ **### 4.2 Tenancy & auth**
>
> **Now:** Every user gets one workspace on first sign-in; the word never appears in the UI.
> `requireSession()` in `lib/workspace.ts` is the only place a workspace is resolved — it
> returns `{ userId, workspaceId }` or redirects to `/login`. Every function in `lib/queries/`
> takes `workspaceId` as its first argument and filters on it, so tenancy is checkable by
> reading signatures. A record in another workspace returns **404, never 403**.
>
> | Path | Role |
> |---|---|
> | `lib/workspace.ts` | `requireSession()` — the only workspace resolution |
> | `lib/queries/*` | Workspace-scoped data access |
>
> | ID | Date | Decision | Why / who asked | Source |
> |---|---|---|---|---|
> | C9 | 2026-10-02 | `requireSession()` is the single choke point in `lib/workspace.ts` | Routes were each resolving the workspace, so one missed filter would leak data. Rejected: a Prisma middleware, which hides the rule from the signature | PR 41 |
> | C4 | 2026-09-16 | Workspace tenancy from day one, one auto-created workspace per user | Operator: adding organisations later becomes "allow a second member", not a data migration | spec D4 |

The shape is stated once, in the present tense; the decisions explain it and stay in the same
place as the thing they explain. C4 is older but still holds, so it stays — if C9 had reversed
it, "Now" would describe the new rule and both rows would remain, the later citing the earlier.

## Needs a Human

> ❌ | Q1 | Need database access | Blocking | 2026-09-17 |

> ✅ | Q1 | Create the Neon project and put the pooled connection string in `.env.local` as `DATABASE_URL` — an agent cannot sign up for the account | Blocks every task from W1 Task 3 onward; tasks 1-2 can proceed without it | 2026-09-17 |

Phrase it so a one-line reply or a two-minute action unblocks it, and say exactly how much is
blocked. "Need database access" makes the operator do the thinking you already did.

## The Shared Tell

Every bad example above is shorter than the good one and reads like a note to yourself. Every
good one reads like a note to a stranger who has your job tomorrow and none of your memory.

Write for that stranger. It is you.
