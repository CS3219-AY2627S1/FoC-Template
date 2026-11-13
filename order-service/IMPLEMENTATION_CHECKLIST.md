# Order D3 roadmap

Select one bounded outcome per approved feature brief. Apply [service invariants](AGENTS.md);
use [README](README.md) for architecture, lifecycle and verification.

Progress (2026-10-22): Foundation, Local APIs (creation, editing, cancellation, discovery, detail,
history) and Lifecycle are built. Events follow the shared
[event communication blueprint](../docs/integration/event-communication-blueprint.md) through the
outbox relay and `credit.events` listener, and work end to end with Credit over Kafka in Compose and
Kubernetes. The errand UI is shipped. Remaining: the async/integration demonstration (iteration 9),
D3 deployment evidence, and Notifications (N2H, in progress in
[`notification-service`](../notification-service/DESIGN.md)). Iteration status and order are tracked in
[DESIGN.md](DESIGN.md#iterations-each-one-is-a-foc-iterate-feature-order--run).

```text
$foc-iterate-feature order-service-scaffold: Create the backend scaffold and its verification.
```

| Stage | Deliverable | Acceptance evidence |
| --- | --- | --- |
| Foundation | Maven scaffold, private persistence/migration, JWT validation, health, OpenAPI and local setup | Clean build/verification; database startup; protected requests reject missing/invalid tokens |
| Local APIs | Published fields/limits/errors, creation, OPEN editing/cancellation, discovery/detail/history, pagination/filter/sort | Validation, ownership and no-mutation-on-error tests; Supplier snapshot contract approved before live lookup |
| Lifecycle | Acceptance, withdrawal, pickup/delivery/completion, expiry and transition history | Self-acceptance/actor checks; acceptance/acceptance, acceptance/cancellation and acceptance/expiry races; duplicate retries; withdrawal after deadline |
| Integration | Approved Supplier/Credit contracts and shared deployment | Authenticated order flow with Credit balances before/after; incomplete reservation/creation and completion/settlement recovery |
| Async demonstration | At least one meaningful team workflow with producer/consumer ownership | Duplicate handling; ordering analysis; persisted-change/publish-failure recovery; retry/failure observability |
| D3 deployment | Coordinated gateway/Compose/CI/environment changes | All four services and supporting components start reproducibly, report readiness and retain data through restarts |

Integration contracts and shared edits follow [root review rules](../AGENTS.md). Coordinate the
async demonstration with Credit and the broker owner; these rows do not require duplicate brokers
or separate async workflows for each service. Scope Notifications and other N2H work separately.
