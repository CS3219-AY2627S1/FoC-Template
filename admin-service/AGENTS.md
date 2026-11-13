# Admin Service

Owner: Darryl. Own the private case database, reviewer permissions and dashboard.
Follow root guidance and docs/integration/admin-service-spec.md. User owns current
account eligibility; Chat owns evidence and conversations. Never read their databases.
Cases own reporting, private status, administrator review/claims, evidence/conversation adapters,
Chat reference confirmation, recovery exports and atomic audit/outbox. Chat owns conversations,
messages, the historical timeline projection and coverage.
Admin owns durable credit-action tracking, command outbox and outcome inbox. Credit exclusively
applies ledger/balance effects; never implement financial effects or fabricate producer outcomes
here. Do not fabricate Chat eligibility/evidence. Admin tracks reversible ban requests; User
alone applies sanctions, protects accounts and owns reactivation/audit. Resolution owns the immutable
decision and atomic CaseResolved outbox entry; it must fail closed on stale/incomplete evidence
or uncertain actions, and never call Chat while holding the case lock.
Shared gateway, deployment and CI changes require a separately nominated editor.

Before final integration or acceptance, read `INTEGRATION_READINESS.md` for unresolved owner
contracts and dependency checks. It records gaps; it does not approve new interfaces.

Admin frontend work also follows the root [product design contract](../design.md). Admin-only
navigation and controls must remain visually consistent without weakening backend authorization.
