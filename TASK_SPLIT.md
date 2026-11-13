# Team ownership

| Owner | Service guidance | Additional responsibility |
| --- | --- | --- |
| Darryl | [User](user-service/AGENTS.md) | Admin Service and Dashboard |
| Jun Hui | [Supplier](supplier-service/AGENTS.md) | Broker reliability, timeline delivery/recovery tooling, observability; initial API Gateway foundation |
| XueTing | [Order](order-service/AGENTS.md) | [Notifications](notification-service/README.md), lifecycle event definitions and transitions |
| Eldridge | [Credit](credit-service/AGENTS.md) | [Chat and Translation](chat-service/README.md), including Chat-owned activity timeline |

Service instructions define detailed scope. User owns identity/roles, Supplier owns location
master data, Order owns lifecycle facts, and Credit owns balance/ledger effects.

[Gateway](gateway-service/AGENTS.md) has no permanent maintainer: nominate one implementer for
each change and obtain affected-owner review. Cloud infrastructure, integration, CI/CD,
responsive end-to-end flows, demos and final submission are shared.

All frontend owners follow the shared [product design contract](design.md). This preserves one
application experience without transferring service behavior or backend ownership. Cross-service
UI edits still require an explicitly assigned shared editor and affected-owner review.

For the Cloud Deployment N2H staging implementation, **Jun Hui is the nominated shared editor**.
This is an iteration assignment, not permanent cloud ownership; Gateway, User, Supplier, Order,
Credit and Admin owners review changes affecting their runtime contracts.

Working and contract-review rules are in [root AGENTS.md](AGENTS.md). Product requirements come
from the approved backlog and wireframes, not this ownership table.

The [Admin N2H specification](docs/integration/admin-service-spec.md) defines the new
`admin-service/` boundary and owner handoffs. There is no separate Logging Service in this design;
Chat persists timeline evidence and Jun Hui owns delivery/recovery infrastructure. User keeps
existing account administration. New integration wire formats require affected-producer review.
