# ADR-045 — Start-based timing and explicit admin penalty decisions

Status: approved by Yao Xiang, 2026-10-17 (CHANGE-135).

The delivery window starts when the assigned courier starts the task, not when
they accept it. Store deadline and actual delivery time with their transitions.
Use a constant-time comparison for nullable isOverdue; avoid checkpoint reads on
every response and a scheduler whose stored flag could lag behind reality.
Once delivered, compare delivery time even when confirmation occurs much later.

Keep ordinary completion/abort funding holds. Admin cancellation is the existing
explicit resolution exception. Store its waiver or requested addition, selected
reason/amount and resolution time on orders atomically with cancellation and
outbox intents. This is a decision record, not evidence that User applied a score.
No extra decision table, callback or immediate penalty-status UI in this change.

Flyway V10 backfills only provable current-attempt start/delivery timestamps;
unknown historical timing/decisions remain null. No rewriting event payloads or
past penalties. Matching image startup applies the additive migration. Retain a
backup, use forward corrections and never edit applied migration history.

Supersedes ADR-044's acceptance-based grouped checkpoint reader. Other behavior,
including authentication, held-order admin resolution and event contracts, remains.
