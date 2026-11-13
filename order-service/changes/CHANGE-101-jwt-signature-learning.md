# CHANGE-101: JWT signing learning

- Date / requester: 2026-10-10 / Vincent.
- Branch: `sprint-2-3-credit-service-concurrency-update-event-payload`, confirmed.
- Classification: documentation of existing behavior; no security design change.
- Scope: local excluded `learning/jwt-signatures-and-public-private-keys.md`.
- Content: private signing/public verification, readable JWT, cached public keys,
  token versus role/ownership/service identity, production/emulator distinction.
- Evidence: inspected Order decoder/validators/role adapter and actual User,
  Credit and Supplier auth paths; official Firebase/Spring docs checked.
- Verification: reviewed note against source; no new runtime security test.
- Rollback: remove the local note; no runtime/data effect. Existing gates unchanged.
