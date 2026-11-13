# Credit D3 roadmap

Select one bounded outcome per approved feature brief. Apply [service invariants](AGENTS.md);
use [README](README.md) for architecture and verification.

```text
$foc-iterate-feature credit-service-scaffold: Create the backend scaffold and its verification.
```

| Stage | Deliverable | Acceptance evidence |
| --- | --- | --- |
| Foundation | Maven scaffold, private persistence/migration, JWT validation, health, OpenAPI and local setup | Clean build/verification; database startup; unauthorized mutations rejected |
| Ledger | Account/reservation/immutable ledger model; reserve, adjust, release and settle | Insufficient funds; concurrent reservations; non-negative balance; adjustment increase/decrease; duplicate/conflicting operations; restart durability |
| Activation | Approved User-owned activation/allocation integration | Ten credits once; delayed/failed/replayed delivery recovers without a second allocation |
| Order integration | Approved reservation, adjustment, completion and cancellation contracts | Full settlement/release; rounded-up compensation; balances before/after; recovery after only one service succeeds |
| Async demonstration | At least one meaningful team workflow with producer/consumer ownership | Duplicate handling; ordering analysis; persisted-change/publish-failure recovery; retry/failure observability |
| D3 deployment | Coordinated gateway/Compose/CI/environment changes | Reproducible startup, readiness, persistence and recovery |

Integration contracts and shared edits follow [root review rules](../AGENTS.md). Coordinate the
async demonstration with Order and the broker owner. Keep Chat/Translation and Logging history
integration in separate scoped iterations.
