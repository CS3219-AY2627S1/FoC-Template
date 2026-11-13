# User Service

Owner: Darryl. Own registration/NUS verification, login/JWT/JWKS, reset OTPs, profiles,
roles/RBAC, protected fields and account lifecycle. Existing account-management UI stays here;
new dispute cases/dashboard belong to Darryl's planned `admin-service/` area.

For Admin integration read [Admin spec](../docs/integration/admin-service-spec.md),
[Chat/security contract](../docs/integration/chat-admin-contract.md) and
[sanction commands](../docs/integration/admin-command-contract.md). User owns eligibility/status
checks and the sanction consumer; do not implement Admin cases or Chat storage here.
Case bans use a separate durable operation/inbox/outbox and the same lifecycle guard as account
management. Duplicate commands republish the recorded result without reapplying a ban, including
after reactivation. Keep reason/audit and account mutations inside User's transaction/database.

Publish stable user UUIDs and signed identity/role claims for consumers. Keep admin assignment and
account-state checks on the backend; never expose privileged self-service role changes. Resolve
missing account/token/OTP/admin rules against the approved backlog.

Read the relevant [README](README.md) behavior, JWT contract and verification sections.
Frontend work also follows the root [product design contract](../design.md); User owns behavior
and identity while the shared contract owns cross-service presentation.
